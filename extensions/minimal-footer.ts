/**
 * minimal-footer: a compact two-line footer.
 *
 * Line 1: <git-branch>                              <current directory>
 * Line 2: <context-cap>                              <model> · <thinking>
 *
 * - The git branch is omitted entirely when not in a repo (or detached with
 *   no name to show).
 * - <context-cap> reuses whatever the context-cap extension published via
 *   ctx.ui.setStatus("context-cap", ...), so its colors/thresholds/labels
 *   (e.g. "DUMB ZONE") show up here unchanged.
 * - <thinking> shows "none" when the current model doesn't support thinking.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

function formatCwd(cwd: string): string {
  const home = process.env.HOME;
  if (home && cwd.startsWith(home)) {
    return `~${cwd.slice(home.length)}`;
  }
  return cwd;
}

/** Lay out `left` and `right` on one line, right-aligned, truncating if needed. */
function justify(left: string, right: string, width: number): string {
  const gap = Math.max(1, width - visibleWidth(left) - visibleWidth(right));
  return truncateToWidth(left + " ".repeat(gap) + right, width);
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.setFooter((tui, theme, footerData) => {
      const unsub = footerData.onBranchChange(() => tui.requestRender());

      return {
        dispose: unsub,
        invalidate() {},
        render(width: number): string[] {
          const branch = footerData.getGitBranch();
          const cwd = formatCwd(ctx.cwd);
          const contextCap =
            footerData.getExtensionStatuses().get("context-cap") ?? "";
          const model = ctx.model?.id ?? "No model selected";
          const thinking = ctx.model?.reasoning ? pi.getThinkingLevel() : "";
          const line1 = justify(
            branch ? theme.fg("dim", branch) : "",
            theme.fg("dim", cwd),
            width,
          );
          const line2 = justify(
            contextCap,
            theme.fg("dim", `${model}${thinking ? " • " + thinking : ""}`),
            width,
          );

          return ["", line1, line2, ""];
        },
      };
    });
  });
}
