/**
 * @see https://github.com/earendil-works/pi/blob/HEAD/packages/coding-agent/examples/extensions/permission-gate.ts
 * Block potentially dangerous commands and ask for user confirmation before executing them.
 */
import {
  type ExtensionAPI,
  isToolCallEventType,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// Configuration file location
const CONFIG_FILE = path.join(os.homedir(), ".pi", "safety-guard-config.json");

interface SafetyConfig {
  whitelist: string[];
  blacklist: string[];
}

function loadConfig(): SafetyConfig {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
    } catch (e) {
      console.error("Failed to load safety guard config:", e);
    }
  }
  return { whitelist: [], blacklist: [] };
}

function saveConfig(config: SafetyConfig) {
  try {
    const dir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (e) {
    console.error("Failed to save safety guard config:", e);
  }
}

/**
 * Checks if a command is considered "dangerous" based on patterns and context.
 */
function getDangerLevel(
  command: string,
  cwd: string,
): "safe" | "warning" | "danger" {
  const cmd = command.trim();

  // 1. Whitelist check
  const config = loadConfig();
  if (config.whitelist.some((pattern) => cmd.includes(pattern))) {
    return "safe";
  }

  // 2. Blacklist check
  if (config.blacklist.some((pattern) => cmd.includes(pattern))) {
    return "danger";
  }

  // 3. Blacklist check for highly specific dangerous patterns
  // Destructive patterns
  // const dangerPatterns = [
  //   /^rm\s+-rf\s+[\/\~]/, // rm -rf / or rm -rf ~
  //   /^rm\s+-rf\s+\*/, // rm -rf * (risky if in root-ish dir)
  //   /^git\s+reset\s+--hard/, // git reset --hard
  //   /^git\s+push\s+--force/, // git push --force
  //   /^git\s+branch\s+-D/, // git branch -D
  //   /^git\s+clean\s+-fdx/, // git clean -fdx
  //   /^sudo\s+/, // sudo commands
  //   /^mkfs\s+/, // formatting disks
  //   /^fdisk\s+/, // partition management
  // ];

  const dangerousPatterns = [
    /\brm\s+(-rf?|--recursive)/i,
    /\bsudo\b/i,
    /\b(chmod|chown)\b.*777/i,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(cmd)) {
      // Context awareness: If it's a wildcard 'rm -rf *', check if we are in a sensitive dir
      if (cmd.includes("rm -rf *")) {
        const sensitiveDirs = [
          "/",
          "/Users",
          "/etc",
          "/usr",
          "/var",
          "/bin",
          "/sbin",
          "/tmp",
        ];
        if (
          sensitiveDirs.some(
            (dir) => cwd.startsWith(dir) && cwd.length > 1 && cwd !== "/",
          )
        ) {
          return "danger";
        }
        return "warning"; // Assume it's probably a local project folder unless it's system root
      }
      return "danger";
    }
  }

  // 4. Check for other warning-level patterns (e.g. shell pipes to rm)
  if (cmd.includes("|") && cmd.includes("rm")) {
    return "warning";
  }

  return "safe";
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (isToolCallEventType("bash", event)) {
      const command = event.input.command;
      const cwd = ctx.cwd;

      const dangerLevel = getDangerLevel(command, cwd);

      if (dangerLevel === "safe") {
        return;
      }

      // If it's danger or warning, we ask the user
      const emoji = dangerLevel === "danger" ? "🚨" : "⚠️";
      // Keep the collapsed row informative by putting the full command
      // (untruncated, multi-line if necessary) right next to the emoji.
      const title = `${emoji} ${command.trim()}`;
      const message = `Dangerous command blocked:\n\n\`\`\`bash\n${command}\n\`\`\`\n\nIn directory: \`${cwd}\``;

      // We use a custom menu for the "Always" options
      // Since ctx.ui.confirm only returns boolean, we use select for more complex options
      const options = [
        { label: "Allow (one-time)", value: "allow" },
        { label: "Deny", value: "deny" },
        { label: "Always Allow this command", value: "always-allow" },
        { label: "Always Deny this command", value: "always-deny" },
      ];

      // Check if we are in a TUI-capable mode
      if (!ctx.hasUI) {
        // In non-interactive mode, block by default
        return { block: true, reason: "Blocked: no UI for confirmation" };
      }

      const choice = await ctx.ui.select(
        title,
        options.map((o) => o.label),
      );

      // Map the selected label back to value
      // Note: select returns the label string in this implementation
      const selectedLabel = choice;
      const selectedValue = options.find(
        (o) => o.label === selectedLabel,
      )?.value;

      if (selectedValue === "allow") {
        return;
      } else if (selectedValue === "deny") {
        return { block: true, reason: "Blocked by user" };
      } else if (selectedValue === "always-allow") {
        const config = loadConfig();
        // Use a simplified version of the command for whitelisting or the whole thing?
        // Let's whitelist the exact command for safety, but maybe allow regex-like behavior later.
        config.whitelist.push(command);
        saveConfig(config);
        ctx.ui.notify("Command added to whitelist.", "info");
        return;
      } else if (selectedValue === "always-deny") {
        const config = loadConfig();
        config.blacklist.push(command);
        saveConfig(config);
        ctx.ui.notify("Command added to blacklist.", "info");
        return { block: true, reason: "Permanently blocked by user" };
      }
    }
  });
}
