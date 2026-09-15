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
  blue: "#0078D4",
  blueBright: "#4DAAFC",
  contextBlue: "#264F78",
  text: "#CCCCCC",
  white: "#FFFFFF",
  muted: "#A7A7A7",
  dim: "#868686",
  green: "#2EA043",
  amber: "#D7BA7D",
  red: "#F85149",
  cyan: "#4EC9B0",
  orange: "#CE9178",
  pinkLight: "#E9A6C3",
  yellow: "#DCDCAA",
  tealDark: "#0E5A53",
  greenDark: "#1F6F3A",
  purpleDark: "#4B3869",
} as const;

const RESET = "\x1b[0m";
const POWERLINE_RIGHT = "";
const PULSE = ["·", "•", "●", "•"];
const PARTIAL_BLOCKS = ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉"];

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

function firstUserPrompt(ctx: ExtensionContext): string {
  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type !== "message" || entry.message.role !== "user") continue;
    const content = entry.message.content;
    const text = typeof content === "string"
      ? content
      : (content as any[]).filter((part) => part.type === "text").map((part) => part.text ?? "").join(" ");
    const clean = sanitize(text);
    if (clean) return clean;
  }
  return "new session";
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
  const exact = Math.max(0, Math.min(1, tokens / maximum)) * cells;
  const full = Math.floor(exact);
  const partialIndex = Math.floor((exact - full) * 8);
  const partial = full < cells ? PARTIAL_BLOCKS[partialIndex] ?? "" : "";
  const empty = Math.max(0, cells - full - (partial ? 1 : 0));
  return `${"█".repeat(full)}${partial}${"░".repeat(empty)}`;
}

function transition(from: string, to: string): string {
  return style(POWERLINE_RIGHT, from, to);
}

function renderSegments(segments: Segment[], finalBackground = COLORS.surface): string {
  if (segments.length === 0) return "";
  let output = "";
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index]!;
    const nextBackground = segments[index + 1]?.background ?? finalBackground;
    output += style(` ${segment.text} `, segment.foreground ?? COLORS.text, segment.background, segment.bold);
    output += transition(segment.background, nextBackground);
  }
  return output;
}

function segmentsWidth(segments: Segment[]): number {
  return segments.reduce((sum, segment) => sum + visibleWidth(` ${segment.text} `) + 1, 0);
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

function thinkingColor(level: string | undefined): string {
  switch (level) {
    case "minimal": return COLORS.blue;
    case "low": return COLORS.blueBright;
    case "medium": return COLORS.cyan;
    case "high": return COLORS.amber;
    case "xhigh":
    case "max": return COLORS.red;
    default: return COLORS.dim;
  }
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
          const sessionMax = wide ? 48 : 24;
          const pathMax = wide ? 72 : 36;
          const branch = footerData.getGitBranch();
          const sessionName = sanitize(ctx.sessionManager.getSessionName() ?? firstUserPrompt(ctx));
          const model = sanitize(ctx.model?.id ?? "no-model");
          const statuses = [...footerData.getExtensionStatuses().entries()]
            .filter(([key]) => key !== "vscode-powerline")
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([, value]) => sanitize(value))
            .filter(Boolean)
            .join("  ");

          const row1Left: Segment[] = [
            { text: `󰚩 ${truncateToWidth(model, 34, "…")}`, background: COLORS.purpleDark, foreground: COLORS.white, bold: true, priority: Number.POSITIVE_INFINITY },
            { text: ` ${truncateMiddleLeft(displayPath(ctx.cwd), pathMax)}`, background: COLORS.blue, foreground: COLORS.white, priority: Number.POSITIVE_INFINITY },
          ];
          if (branch) row1Left.push({ text: ` ${sanitize(branch)}${dirty ? " 󰀨" : " 󰄬"}`, background: dirty ? COLORS.orange : COLORS.greenDark, foreground: COLORS.white, bold: dirty, priority: Number.POSITIVE_INFINITY });
          row1Left.push({ text: `󰢻 ${truncateToWidth(sessionName, sessionMax, "…")}`, background: COLORS.tealDark, foreground: COLORS.white, priority: 2 });
          if (statuses) row1Left.push({ text: `󰖟 ${statuses}`, background: COLORS.input, foreground: COLORS.yellow, priority: 1 });

          let fittedLeft = fitByPriority(row1Left, width);
          let left = renderSegments(fittedLeft);
          let leftWidth = visibleWidth(left);
          if (leftWidth > width) {
            fittedLeft = fittedLeft.slice(0, 1);
            fittedLeft[0] = { ...fittedLeft[0]!, text: truncateToWidth(fittedLeft[0]!.text, Math.max(4, width - 2), "…") };
            left = renderSegments(fittedLeft);
            leftWidth = visibleWidth(left);
          }
          const row1 = fill(left + " ".repeat(Math.max(0, width - leftWidth)));

          const totals = collectTotals(ctx);
          const context = ctx.getContextUsage();
          const used = context?.tokens ?? null;
          const maximum = context?.contextWindow ?? ctx.model?.contextWindow ?? 0;
          const percent = used !== null && maximum > 0 ? (used / maximum) * 100 : null;
          const meterColor = contextColor(used);
          const meter = contextBar(used, maximum);
          const contextValue = `${used === null ? "?" : compactNumber(used)}/${compactNumber(maximum)} (${percent === null ? "?" : `${percent.toFixed(1)}%`})`;
          const pulse = activity === "READY" || activity === "ERROR" ? activityIcon(activity) : `${PULSE[pulseFrame]} ${activityIcon(activity)}`;
          let activityLabel: string = activity;
          if (activity === "TOOLS" && activeTools.size > 0) {
            const currentTool = [...activeTools.values()].at(-1)!;
            const current = `${toolIcon(currentTool)} ${currentTool.toUpperCase()}`;
            activityLabel = `${current}${activeTools.size > 1 ? ` +${activeTools.size - 1}` : ""}`;
          }
          const activityBackground = activity === "ERROR" ? COLORS.red : activity === "READY" ? COLORS.greenDark : activity === "WAITING" ? COLORS.orange : COLORS.blue;
          const hit = totals.latestCacheHit === undefined ? "—" : `${totals.latestCacheHit.toFixed(1)}%`;
          const autoOff = compactionEnabled(ctx.cwd, ctx.isProjectTrusted()) ? "" : " · 󰅙 AUTO OFF";

          const row2Segments: Segment[] = [
            { text: `${pulse} ${activityLabel}`, background: activityBackground, foreground: COLORS.white, bold: true },
            { text: `󰍛 CTX ${foreground(meter, meterColor, COLORS.white)} ${contextValue}${autoOff}`, background: COLORS.contextBlue, foreground: COLORS.white, bold: true },
            { text: ` IN ${compactNumber(totals.input)}   OUT ${compactNumber(totals.output)}`, background: COLORS.pinkLight, foreground: COLORS.surface, bold: true, priority: 3 },
            { text: `󰆼 CACHE ${compactNumber(totals.cacheRead)}   ${compactNumber(totals.cacheWrite)}  󰈸 HIT ${hit}`, background: COLORS.purpleDark, foreground: COLORS.white, priority: 2 },
            { text: `󰝑 COST ${formatCost(totals.cost)}`, background: COLORS.orange, foreground: COLORS.white, bold: true, priority: 1 },
            { text: `󰒲 THINK ${ctx.thinkingLevel ?? "off"}`, background: COLORS.input, foreground: thinkingColor(ctx.thinkingLevel), bold: true, priority: 4 },
          ];

          let fittedRow2 = fitByPriority(row2Segments, width);
          if (segmentsWidth(fittedRow2) > width) {
            fittedRow2 = fittedRow2.slice(0, 2);
            const availableContext = Math.max(8, width - visibleWidth(` ${fittedRow2[0]!.text} `) - 4);
            fittedRow2[1] = { ...fittedRow2[1]!, text: truncateToWidth(fittedRow2[1]!.text, availableContext, "…") };
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
