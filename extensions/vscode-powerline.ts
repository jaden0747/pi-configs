import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

type Activity = "READY" | "THINKING" | "TOOLS" | "WAITING" | "ERROR";
type Segment = { text: string; background: string; foreground?: string; bold?: boolean; priority?: number };

type Totals = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  latestCacheHit?: number;
};

const COLORS = {
  surface: "#181818",
  editor: "#1F1F1F",
  raised: "#252526",
  input: "#313131",
  blue: "#75BEFF",
  contextBlue: "#264F78",
  text: "#F0F0F0",
  white: "#FFFFFF",
  muted: "#D4D4D4",
  dim: "#B8B8B8",
  green: "#65E6C1",
  amber: "#FFD580",
  red: "#FF6B6B",
  orange: "#FFB86C",
  success: "#7EE787",
  warning: "#FFD580",
  thinking: "#E2A8FF",
  thinkingEffort: "#FF7A9E",
  pinkLight: "#FFB6D9",
  yellow: "#FFF59D",
  pathTeal: "#5DE2E7",
  folder: "#CCCCCC",
  purpleDark: "#C9A0FF",
} as const;

const RESET = "\x1b[0m";
const PULSE = ["·", "•", "●", "•"];

function rgb(hex: string): string {
  const value = hex.slice(1);
  return `${Number.parseInt(value.slice(0, 2), 16)};${Number.parseInt(value.slice(2, 4), 16)};${Number.parseInt(value.slice(4, 6), 16)}`;
}

function style(text: string, foreground: string, background: string, bold = false): string {
  return `\x1b[38;2;${rgb(foreground)}m\x1b[48;2;${rgb(background)}m${bold ? "\x1b[1m" : ""}${text}${bold ? "\x1b[22m" : ""}`;
}

function fill(text: string, background = COLORS.surface): string {
  return `\x1b[48;2;${rgb(background)}m${text}${RESET}`;
}

function foreground(text: string, color: string, restore: string = COLORS.text): string {
  return `\x1b[38;2;${rgb(color)}m${text}\x1b[38;2;${rgb(restore)}m`;
}

function sanitize(text: string): string {
  return text
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactNumber(value: number): string {
  if (value < 1_000) return `${Math.round(value)}`;
  if (value < 10_000) return `${(value / 1_000).toFixed(1)}k`;
  if (value < 1_000_000) return `${Math.round(value / 1_000)}k`;
  if (value < 10_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  return `${Math.round(value / 1_000_000)}M`;
}

function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

function forwardSlashes(path: string): string {
  return path.replaceAll("\\", "/");
}

function displayPath(cwd: string): string {
  const home = resolve(homedir());
  const absolute = resolve(cwd);
  const fromHome = relative(home, absolute);
  const insideHome = fromHome === "" || (fromHome !== ".." && !fromHome.startsWith(`..\\`) && !fromHome.startsWith("../") && !isAbsolute(fromHome));
  if (!insideHome) return forwardSlashes(absolute);
  return fromHome === "" ? "~" : `~/${forwardSlashes(fromHome)}`;
}

function truncateMiddleLeft(text: string, width: number): string {
  if (visibleWidth(text) <= width) return text;
  if (width <= 1) return "…";
  return `…${text.slice(-(width - 1))}`;
}

function collectTotals(ctx: ExtensionContext): Totals {
  const totals: Totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
  for (const entry of ctx.sessionManager.getEntries()) {
    let usage: any;
    if (entry.type === "message" && entry.message.role === "assistant") {
      usage = entry.message.usage;
      const prompt = (usage?.input ?? 0) + (usage?.cacheRead ?? 0) + (usage?.cacheWrite ?? 0);
      totals.latestCacheHit = prompt > 0 ? ((usage?.cacheRead ?? 0) / prompt) * 100 : undefined;
    } else if (entry.type === "message" && entry.message.role === "toolResult") {
      usage = entry.message.usage;
    } else if (entry.type === "branch_summary" || entry.type === "compaction") {
      usage = entry.usage;
    }
    if (!usage) continue;
    totals.input += usage.input ?? 0;
    totals.output += usage.output ?? 0;
    totals.cacheRead += usage.cacheRead ?? 0;
    totals.cacheWrite += usage.cacheWrite ?? 0;
    totals.cost += usage.cost?.total ?? 0;
  }
  return totals;
}

function contextColor(tokens: number | null): string {
  if (tokens === null) return COLORS.dim;
  if (tokens < 50_000) return COLORS.green;
  if (tokens <= 150_000) return COLORS.amber;
  return COLORS.red;
}

function contextBar(tokens: number | null, maximum: number, cells = 20): string {
  if (tokens === null || maximum <= 0) return "░".repeat(cells);
  const ratio = Math.max(0, Math.min(1, tokens / maximum));
  const full = Math.round(ratio * cells);
  return `${"█".repeat(full)}${"░".repeat(cells - full)}`;
}

function renderSegments(segments: Segment[]): string {
  if (segments.length === 0) return "";
  return segments
    .map((segment) => style(` ${segment.text} `, segment.foreground ?? COLORS.text, COLORS.surface, segment.bold))
    .join("");
}

function segmentsWidth(segments: Segment[]): number {
  if (segments.length === 0) return 0;
  return segments.reduce((sum, segment) => sum + visibleWidth(` ${segment.text} `), 0);
}

function fitByPriority(segments: Segment[], width: number): Segment[] {
  const fitted = [...segments];
  while (segmentsWidth(fitted) > width && fitted.some((segment) => segment.priority !== undefined)) {
    const removable = fitted
      .map((segment, index) => ({ index, priority: segment.priority ?? Number.POSITIVE_INFINITY }))
      .sort((a, b) => a.priority - b.priority)[0];
    if (!removable || !Number.isFinite(removable.priority)) break;
    fitted.splice(removable.index, 1);
  }
  return fitted;
}

function compactionEnabled(cwd: string, projectTrusted: boolean): boolean {
  const readSetting = (path: string): boolean | undefined => {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8"));
      return typeof parsed?.compaction?.enabled === "boolean" ? parsed.compaction.enabled : undefined;
    } catch {
      return undefined;
    }
  };
  const configRoot = process.env.PI_CODING_AGENT_DIR || resolve(homedir(), ".pi", "agent");
  const globalValue = readSetting(resolve(configRoot, "settings.json"));
  const projectValue = projectTrusted ? readSetting(resolve(cwd, CONFIG_DIR_NAME, "settings.json")) : undefined;
  return projectValue ?? globalValue ?? true;
}

function activityIcon(value: Activity): string {
  switch (value) {
    case "READY": return "󰄬";
    case "THINKING": return "󰚩";
    case "TOOLS": return "󰏗";
    case "WAITING": return "󰥔";
    case "ERROR": return "󰅚";
  }
}

function toolIcon(name: string): string {
  switch (name.toLowerCase()) {
    case "bash": return "";
    case "read": return "";
    case "edit": return "󰏫";
    case "write": return "";
    default: return "󰏗";
  }
}

export default function vscodePowerline(pi: ExtensionAPI) {
  let activity: Activity = "READY";
  let previousActivity: Activity = "READY";
  let errorPersistent = false;
  let dirty = false;
  let pulseFrame = 0;
  let pulseTimer: ReturnType<typeof setInterval> | undefined;
  let requestRender: (() => void) | undefined;
  let unsubscribeBranch: (() => void) | undefined;
  const activeTools = new Map<string, string>();

  const stopPulse = () => {
    if (pulseTimer) clearInterval(pulseTimer);
    pulseTimer = undefined;
  };

  const setActivity = (next: Activity) => {
    activity = next;
    const animated = next === "THINKING" || next === "TOOLS" || next === "WAITING";
    if (animated && !pulseTimer) {
      pulseTimer = setInterval(() => {
        pulseFrame = (pulseFrame + 1) % PULSE.length;
        requestRender?.();
      }, 220);
    } else if (!animated) {
      stopPulse();
      pulseFrame = 2;
    }
    requestRender?.();
  };

  const refreshDirty = async (ctx: ExtensionContext) => {
    try {
      const result = await pi.exec("git", ["status", "--porcelain", "--untracked-files=normal"], {
        timeout: 2500,
      });
      dirty = result.code === 0 && result.stdout.trim().length > 0;
    } catch {
      dirty = false;
    }
    requestRender?.();
  };

  pi.on("session_start", async (_event, ctx) => {
    errorPersistent = false;
    activeTools.clear();
    setActivity("READY");

    ctx.ui.setWorkingIndicator({
      frames: PULSE.map((frame) => ctx.ui.theme.fg("accent", frame)),
      intervalMs: 220,
    });

    ctx.ui.setFooter((tui, _theme, footerData) => {
      requestRender = () => tui.requestRender();
      unsubscribeBranch = footerData.onBranchChange(() => {
        void refreshDirty(ctx);
        tui.requestRender();
      });

      return {
        invalidate() {
          tui.requestRender();
        },
        dispose() {
          unsubscribeBranch?.();
          unsubscribeBranch = undefined;
          requestRender = undefined;
          stopPulse();
        },
        render(width: number): string[] {
          const wide = width >= 200;
          const pathMax = wide ? 72 : 36;
          const branch = footerData.getGitBranch();
          const model = sanitize(ctx.model?.id ?? "no-model");
          const statuses = [...footerData.getExtensionStatuses().entries()]
            .filter(([key]) => key !== "vscode-powerline")
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([, value]) => sanitize(value))
            .filter(Boolean)
            .join("  ");

          const stateIcon = activity === "TOOLS" && activeTools.size > 0
            ? toolIcon([...activeTools.values()].at(-1)!)
            : activityIcon(activity);
          const pulse = activity === "READY" || activity === "ERROR" ? stateIcon : `${PULSE[pulseFrame]} ${stateIcon}`;
          const parallelCount = activity === "TOOLS" && activeTools.size > 1 ? ` +${activeTools.size - 1}` : "";
          const activityForeground = activity === "ERROR" ? COLORS.red : activity === "READY" ? COLORS.green : activity === "WAITING" ? COLORS.orange : COLORS.blue;

          const activitySegment: Segment = {
            text: `${pulse} ${activity}${parallelCount}`,
            background: COLORS.surface,
            foreground: activityForeground,
            bold: true,
            priority: Number.POSITIVE_INFINITY,
          };
          const row1Left: Segment[] = [
            { text: ` ${truncateMiddleLeft(displayPath(ctx.cwd), pathMax)}`, background: COLORS.surface, foreground: COLORS.folder, priority: 3 },
          ];
          if (branch) row1Left.push({ text: ` ${sanitize(branch)}${dirty ? " 󰀨" : " 󰄬"}`, background: COLORS.surface, foreground: dirty ? COLORS.warning : COLORS.success, bold: dirty, priority: 2 });
          if (statuses) row1Left.push({ text: `󰖟 ${statuses}`, background: COLORS.surface, foreground: COLORS.warning, priority: 1 });

          const activityWidth = segmentsWidth([activitySegment]);
          const separatorWidth = 1;
          const leftAvailable = Math.max(1, width - activityWidth - separatorWidth);
          let fittedLeft = fitByPriority(row1Left, leftAvailable);
          let left = renderSegments(fittedLeft);
          let leftWidth = visibleWidth(left);
          if (leftWidth > leftAvailable) {
            fittedLeft = fittedLeft.length > 0
              ? [{ ...fittedLeft[0]!, text: truncateToWidth(fittedLeft[0]!.text, Math.max(1, leftAvailable - 2), "…") }]
              : [];
            left = renderSegments(fittedLeft);
            leftWidth = visibleWidth(left);
          }
          const renderedActivity = renderSegments([activitySegment]);
          const row1Content = left
            ? left + " " + renderedActivity
            : renderedActivity;
          const row1 = fill(row1Content + " ".repeat(Math.max(0, width - visibleWidth(row1Content))));

          const totals = collectTotals(ctx);
          const context = ctx.getContextUsage();
          const used = context?.tokens ?? null;
          const maximum = context?.contextWindow ?? ctx.model?.contextWindow ?? 0;
          const percent = used !== null && maximum > 0 ? (used / maximum) * 100 : null;
          const meterColor = contextColor(used);
          const meter = contextBar(used, maximum);
          const contextValue = `${used === null ? "?" : compactNumber(used)}/${compactNumber(maximum)} (${percent === null ? "?" : `${percent.toFixed(1)}%`})`;
          const hit = totals.latestCacheHit === undefined ? "—" : `${totals.latestCacheHit.toFixed(1)}%`;
          const autoOff = compactionEnabled(ctx.cwd, ctx.isProjectTrusted()) ? "" : " · 󰅙";

          const row2Segments: Segment[] = [
            { text: `󰚩 ${truncateToWidth(model, 34, "…")}`, background: COLORS.surface, foreground: COLORS.yellow, priority: Number.POSITIVE_INFINITY },
            { text: `󰧑 ${ctx.thinkingLevel ?? "off"}`, background: COLORS.surface, foreground: COLORS.thinkingEffort, priority: 4 },
            { text: `󰍛 ${meter} ${contextValue}${autoOff}`, background: COLORS.surface, foreground: meterColor, priority: Number.POSITIVE_INFINITY },
            { text: ` ${compactNumber(totals.input)}   ${compactNumber(totals.output)}`, background: COLORS.surface, foreground: COLORS.orange, priority: 3 },
            { text: `󰆼 ${compactNumber(totals.cacheRead)}   ${compactNumber(totals.cacheWrite)}  󰈸 ${hit}`, background: COLORS.surface, foreground: COLORS.thinking, priority: 2 },
            { text: `󰄔 ${formatCost(totals.cost)}`,  background: COLORS.surface, foreground: COLORS.warning, priority: 1 },
          ];

          let fittedRow2 = fitByPriority(row2Segments, width);
          if (segmentsWidth(fittedRow2) > width) {
            fittedRow2 = [{ ...fittedRow2[0]!, text: truncateToWidth(fittedRow2[0]!.text, Math.max(1, width - 3), "…") }];
          }
          const renderedRow2 = renderSegments(fittedRow2);
          const row2Width = visibleWidth(renderedRow2);
          const row2 = fill(renderedRow2 + " ".repeat(Math.max(0, width - row2Width)));
          return [row1, row2];
        },
      };
    });

    await refreshDirty(ctx);
  });

  pi.on("before_agent_start", async (_event, _ctx) => {
    errorPersistent = false;
    setActivity("THINKING");
  });

  pi.on("turn_start", async () => {
    if (!errorPersistent) setActivity("THINKING");
  });

  pi.on("tool_execution_start", async (event) => {
    activeTools.set(event.toolCallId, event.toolName);
    setActivity("TOOLS");
  });

  pi.on("tool_execution_end", async (event) => {
    activeTools.delete(event.toolCallId);
    if (event.isError) errorPersistent = true;
    if (activeTools.size > 0) setActivity("TOOLS");
    else setActivity(errorPersistent ? "ERROR" : "THINKING");
  });

  pi.on("ui_prompt_start", async () => {
    previousActivity = activity;
    setActivity("WAITING");
  });

  pi.on("ui_prompt_end", async () => {
    setActivity(errorPersistent ? "ERROR" : activeTools.size > 0 ? "TOOLS" : previousActivity);
  });

  pi.on("message_end", async (event) => {
    if (event.message.role === "assistant" && "errorMessage" in event.message && event.message.errorMessage) {
      errorPersistent = true;
      setActivity("ERROR");
    }
    requestRender?.();
  });

  pi.on("agent_settled", async (_event, ctx) => {
    setActivity(errorPersistent ? "ERROR" : "READY");
    await refreshDirty(ctx);
  });

  pi.on("model_select", async () => requestRender?.());
  pi.on("thinking_level_select", async () => requestRender?.());
  pi.on("session_info_changed", async () => requestRender?.());

  pi.on("session_shutdown", async () => {
    unsubscribeBranch?.();
    unsubscribeBranch = undefined;
    stopPulse();
    requestRender = undefined;
  });
}
