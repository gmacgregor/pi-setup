/**
 * context-cap: proactively trigger compaction before the context window
 * grows past a token budget you control, instead of relying on pi's
 * default `reserveTokens` (which is a flat token count that doesn't scale
 * sensibly across models with very different context windows).
 *
 * The effective cap for the *current* model is:
 *
 *   min(maxTokens, maxPercent% of contextWindow)
 *
 * Examples with the defaults below (maxTokens=100_000, maxPercent=40):
 *   - 1,000,000 token window -> min(100k, 400k) = 100k tokens
 *   -   250,000 token window -> min(100k, 100k) = 100k tokens (40%)
 *
 * Config is persisted to ~/.pi/agent/context-cap.json and can be viewed or
 * changed at runtime with `/context-cap`.
 */
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

interface ContextCapConfig {
  enabled: boolean;
  /** Absolute token cap. */
  maxTokens: number;
  /** Percent-of-context-window cap (0-100). */
  maxPercent: number;
}

const DEFAULT_CONFIG: ContextCapConfig = {
  enabled: true,
  maxTokens: 100_000,
  maxPercent: 40,
};

/** Fraction of the effective cap at which the status color turns to "error". */
const ERROR_THRESHOLD_RATIO = 0.9;
/** Fraction of the effective cap at which the status color turns to "warning". */
const WARNING_THRESHOLD_RATIO = 0.8;

/** Absolute token count at which we start warning the user they're in the "dumb zone". */
const DUMB_ZONE_TOKENS = 90_000;

const CONFIG_PATH = join(homedir(), ".pi", "agent", "context-cap.json");

function loadConfig(): ContextCapConfig {
  try {
    if (existsSync(CONFIG_PATH)) {
      const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
      return { ...DEFAULT_CONFIG, ...raw };
    }
  } catch {
    // Malformed config file; fall back to defaults rather than crashing.
  }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(config: ContextCapConfig): void {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function formatTokens(n: number): string {
  if (n < 1000) return `${Math.round(n)}`;
  return `${(n / 1000).toFixed(1)}k`;
}

export default function (pi: ExtensionAPI) {
  let config = loadConfig();
  let previousTokens: number | null | undefined;
  let compacting = false;

  const effectiveCap = (contextWindow: number): number =>
    Math.min(config.maxTokens, (config.maxPercent / 100) * contextWindow);

  const updateStatus = (ctx: ExtensionContext) => {
    const usage = ctx.getContextUsage();
    const tokens = usage?.tokens;
    const used = tokens != null ? formatTokens(tokens) : "?";
    if (!config.enabled) {
      ctx.ui.setStatus("context-cap", `${used} · off`);
      return;
    }
    const cw = usage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
    const cap = cw ? effectiveCap(cw) : config.maxTokens;
    const ratio = tokens != null && cap > 0 ? tokens / cap : 0;
    const color =
      ratio >= ERROR_THRESHOLD_RATIO
        ? "error"
        : ratio >= WARNING_THRESHOLD_RATIO
          ? "warning"
          : "muted";
    const dumbZone =
      tokens != null && tokens >= DUMB_ZONE_TOKENS ? " DUMB ZONE" : "";
    ctx.ui.setStatus(
      "context-cap",
      ctx.ui.theme.fg(color, `${used}${dumbZone} · on`),
    );
  };

  const triggerCompaction = (ctx: ExtensionContext, reason: string) => {
    if (compacting) return;
    compacting = true;
    if (ctx.hasUI) ctx.ui.notify(`context-cap: ${reason} — compacting`, "info");
    ctx.compact({
      onComplete: () => {
        compacting = false;
        previousTokens = null;
        if (ctx.hasUI)
          ctx.ui.notify("context-cap: compaction completed", "info");
        updateStatus(ctx);
      },
      onError: (error) => {
        compacting = false;
        if (ctx.hasUI)
          ctx.ui.notify(
            `context-cap: compaction failed: ${error.message}`,
            "error",
          );
      },
    });
  };

  pi.on("session_start", async (_event, ctx) => {
    updateStatus(ctx);
  });

  pi.on("model_select", async (_event, ctx) => {
    // Context window may have changed; recompute from scratch next turn.
    previousTokens = undefined;
    updateStatus(ctx);
  });

  pi.on("turn_end", (_event, ctx) => {
    updateStatus(ctx);
    if (!config.enabled || compacting) return;

    const usage = ctx.getContextUsage();
    const currentTokens = usage?.tokens ?? null;
    if (currentTokens === null || !usage) return;

    const cap = effectiveCap(usage.contextWindow);

    // Only fire on the transition from under-cap to over-cap so we don't
    // re-trigger every turn once a compaction is already in flight/settling.
    const crossedThreshold =
      previousTokens !== undefined &&
      previousTokens !== null &&
      previousTokens <= cap;
    previousTokens = currentTokens;

    if (!crossedThreshold || currentTokens <= cap) return;

    triggerCompaction(
      ctx,
      `${formatTokens(currentTokens)} tokens exceeded cap of ${formatTokens(cap)}`,
    );
  });

  pi.registerCommand("context-cap", {
    description: "View or configure the proactive context-compaction cap",
    handler: async (args, ctx) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);

      if (parts.length === 0) {
        const usage = ctx.getContextUsage();
        const cw = usage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
        const cap = cw ? effectiveCap(cw) : config.maxTokens;
        const lines = [
          `context-cap: ${config.enabled ? "enabled" : "disabled"}`,
          `  maxTokens:  ${config.maxTokens} (${formatTokens(config.maxTokens)})`,
          `  maxPercent: ${config.maxPercent}%`,
          cw
            ? `  effective cap for current model (${formatTokens(cw)} window): ${formatTokens(cap)} tokens`
            : "",
          usage?.tokens != null
            ? `  current usage: ${formatTokens(usage.tokens)} tokens`
            : "",
          "",
          "Usage:",
          "  /context-cap                 show current config",
          "  /context-cap on|off           enable/disable proactive compaction",
          "  /context-cap tokens <n>       set absolute token cap",
          "  /context-cap percent <n>      set percent-of-window cap (0-100)",
        ].filter(Boolean);
        ctx.ui.notify(lines.join("\n"), "info");
        return;
      }

      const [sub, value] = parts;

      if (sub === "on" || sub === "off") {
        config.enabled = sub === "on";
        saveConfig(config);
        updateStatus(ctx);
        ctx.ui.notify(
          `context-cap: ${config.enabled ? "enabled" : "disabled"}`,
          "info",
        );
        return;
      }

      if (sub === "tokens") {
        const n = Number(value);
        if (!Number.isFinite(n) || n <= 0) {
          ctx.ui.notify(
            "context-cap: tokens must be a positive number",
            "error",
          );
          return;
        }
        config.maxTokens = Math.round(n);
        saveConfig(config);
        updateStatus(ctx);
        ctx.ui.notify(
          `context-cap: maxTokens set to ${formatTokens(config.maxTokens)}`,
          "info",
        );
        return;
      }

      if (sub === "percent") {
        const n = Number(value);
        if (!Number.isFinite(n) || n <= 0 || n > 100) {
          ctx.ui.notify(
            "context-cap: percent must be between 0 and 100",
            "error",
          );
          return;
        }
        config.maxPercent = n;
        saveConfig(config);
        updateStatus(ctx);
        ctx.ui.notify(
          `context-cap: maxPercent set to ${config.maxPercent}%`,
          "info",
        );
        return;
      }

      ctx.ui.notify(`context-cap: unknown subcommand "${sub}"`, "error");
    },
  });
}
