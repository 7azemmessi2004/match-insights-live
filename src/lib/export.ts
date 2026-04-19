/**
 * Export utilities for match data.
 * Supports: JSON, Excel (xlsx), AI report (txt), Video (WebM canvas recording), ZIP (all).
 */

import * as XLSX from "xlsx";
import JSZip from "jszip";
import { generateRuleInsights } from "./rule-insights";

export interface ExportMatch {
  id: string;
  competition: string | null;
  home_score: number;
  away_score: number;
  home_team: { name: string; short_name: string; color: string } | null;
  away_team: { name: string; short_name: string; color: string } | null;
}

export interface ExportEvent {
  id: string;
  event_type: string;
  outcome: string | null;
  minute: number;
  second: number;
  x: number | null;
  y: number | null;
  end_x: number | null;
  end_y: number | null;
  tags: string[];
  xg: number | null;
  team_id: string | null;
  player_id: string | null;
  metadata: Record<string, unknown>;
}

// ── JSON ─────────────────────────────────────────────────────────────────────

export function exportJSON(match: ExportMatch, events: ExportEvent[]) {
  const payload = {
    schema_version: "1.0",
    exported_at: new Date().toISOString(),
    match,
    events,
  };
  downloadBlob(
    new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
    `match-${match.id.slice(0, 8)}.json`
  );
}

// ── Excel ─────────────────────────────────────────────────────────────────────

export function exportExcel(match: ExportMatch, events: ExportEvent[]) {
  const wb = XLSX.utils.book_new();

  // Summary sheet
  const summaryData = [
    ["Match Export", `${match.home_team?.name} vs ${match.away_team?.name}`],
    ["Score", `${match.home_score} – ${match.away_score}`],
    ["Competition", match.competition ?? "—"],
    ["Exported At", new Date().toLocaleString()],
    [],
    ["Metric", match.home_team?.short_name ?? "Home", match.away_team?.short_name ?? "Away"],
    [
      "Total Events",
      events.filter((e) => e.team_id === (match as any).home_team_id).length,
      events.filter((e) => e.team_id === (match as any).away_team_id).length,
    ],
    [
      "Passes",
      events.filter((e) => e.event_type === "pass" && e.team_id === (match as any).home_team_id).length,
      events.filter((e) => e.event_type === "pass" && e.team_id === (match as any).away_team_id).length,
    ],
    [
      "Shots",
      events.filter((e) => e.event_type === "shot" && e.team_id === (match as any).home_team_id).length,
      events.filter((e) => e.event_type === "shot" && e.team_id === (match as any).away_team_id).length,
    ],
    [
      "Total xG",
      events.filter((e) => e.team_id === (match as any).home_team_id).reduce((s, e) => s + (e.xg ?? 0), 0).toFixed(2),
      events.filter((e) => e.team_id === (match as any).away_team_id).reduce((s, e) => s + (e.xg ?? 0), 0).toFixed(2),
    ],
  ];
  const summaryWS = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, summaryWS, "Summary");

  // Events sheet
  const eventRows = events.map((e) => ({
    Minute: e.minute,
    Second: e.second,
    Type: e.event_type,
    Outcome: e.outcome ?? "",
    Team: e.team_id === (match as any).home_team_id ? match.home_team?.short_name : match.away_team?.short_name,
    Player: (e.metadata as any)?.player_name ?? "",
    "Jersey #": (e.metadata as any)?.player_number ?? "",
    "Body Part": (e.metadata as any)?.body_part ?? "",
    X: e.x ?? "",
    Y: e.y ?? "",
    "End X": e.end_x ?? "",
    "End Y": e.end_y ?? "",
    xG: e.xg ?? "",
    Tags: e.tags.join(", "),
  }));
  const eventsWS = XLSX.utils.json_to_sheet(eventRows);
  XLSX.utils.book_append_sheet(wb, eventsWS, "Events");

  // xG timeline sheet
  const xgRows = events
    .filter((e) => (e.xg ?? 0) > 0)
    .map((e) => ({
      Minute: e.minute,
      Team: e.team_id === (match as any).home_team_id ? match.home_team?.short_name : match.away_team?.short_name,
      xG: e.xg,
      Outcome: e.outcome ?? "",
    }));
  const xgWS = XLSX.utils.json_to_sheet(xgRows);
  XLSX.utils.book_append_sheet(wb, xgWS, "xG Timeline");

  XLSX.writeFile(wb, `match-${match.id.slice(0, 8)}.xlsx`);
}

// ── AI Report ─────────────────────────────────────────────────────────────────

export function exportAIReport(match: ExportMatch, events: ExportEvent[]): string {
  const insights = generateRuleInsights(match as any, events as any);
  const home = match.home_team?.name ?? "Home";
  const away = match.away_team?.name ?? "Away";
  const homeEvents = events.filter((e) => e.team_id === (match as any).home_team_id);
  const awayEvents = events.filter((e) => e.team_id === (match as any).away_team_id);

  const passes = (evs: ExportEvent[]) => evs.filter((e) => e.event_type === "pass").length;
  const shots = (evs: ExportEvent[]) => evs.filter((e) => e.event_type === "shot").length;
  const xgTotal = (evs: ExportEvent[]) => evs.reduce((s, e) => s + (e.xg ?? 0), 0).toFixed(2);
  const tackles = (evs: ExportEvent[]) => evs.filter((e) => e.event_type === "tackle").length;

  const lines = [
    "═══════════════════════════════════════════════════════════",
    `  MATCH REPORT`,
    `  ${home} ${match.home_score} – ${match.away_score} ${away}`,
    `  ${match.competition ?? ""}`,
    `  Generated: ${new Date().toLocaleString()}`,
    "═══════════════════════════════════════════════════════════",
    "",
    "── MATCH SUMMARY ───────────────────────────────────────────",
    "",
    `  Final Score: ${home} ${match.home_score} – ${match.away_score} ${away}`,
    `  Total Events Tracked: ${events.length}`,
    "",
    "── STATISTICS ──────────────────────────────────────────────",
    "",
    `  ${"Metric".padEnd(20)} ${"Home".padEnd(12)} Away`,
    `  ${"──────".padEnd(20)} ${"────".padEnd(12)} ────`,
    `  ${"Passes".padEnd(20)} ${String(passes(homeEvents)).padEnd(12)} ${passes(awayEvents)}`,
    `  ${"Shots".padEnd(20)} ${String(shots(homeEvents)).padEnd(12)} ${shots(awayEvents)}`,
    `  ${"Tackles".padEnd(20)} ${String(tackles(homeEvents)).padEnd(12)} ${tackles(awayEvents)}`,
    `  ${"xG".padEnd(20)} ${String(xgTotal(homeEvents)).padEnd(12)} ${xgTotal(awayEvents)}`,
    "",
    "── AI INSIGHTS ─────────────────────────────────────────────",
    "",
    ...insights.map((i) => [
      `  [${i.severity.toUpperCase()}] ${i.title}`,
      `  ${i.body}`,
      "",
    ]).flat(),
    "── EVENT TIMELINE ──────────────────────────────────────────",
    "",
    ...events
      .sort((a, b) => a.minute * 60 + a.second - (b.minute * 60 + b.second))
      .map((e) => {
        const team = e.team_id === (match as any).home_team_id ? home : away;
        const player = (e.metadata as any)?.player_name ? ` (${(e.metadata as any).player_name})` : "";
        const xg = (e.xg ?? 0) > 0 ? ` xG:${e.xg!.toFixed(2)}` : "";
        return `  ${String(e.minute).padStart(2, "0")}:${String(e.second).padStart(2, "0")}  ${team.padEnd(12)} ${e.event_type.padEnd(14)}${player}${xg}`;
      }),
    "",
    "═══════════════════════════════════════════════════════════",
  ];

  const text = lines.join("\n");
  downloadBlob(
    new Blob([text], { type: "text/plain" }),
    `match-report-${match.id.slice(0, 8)}.txt`
  );
  return text;
}

// ── ZIP (all) ─────────────────────────────────────────────────────────────────

export async function exportZIP(match: ExportMatch, events: ExportEvent[]) {
  const zip = new JSZip();

  // JSON
  const jsonPayload = JSON.stringify({ schema_version: "1.0", match, events }, null, 2);
  zip.file("match.json", jsonPayload);

  // AI report text
  const reportLines = generateRuleInsights(match as any, events as any);
  const home = match.home_team?.name ?? "Home";
  const away = match.away_team?.name ?? "Away";
  const reportText = [
    `MATCH REPORT: ${home} ${match.home_score} – ${match.away_score} ${away}`,
    `Generated: ${new Date().toLocaleString()}`,
    "",
    ...reportLines.map((i) => `[${i.severity.toUpperCase()}] ${i.title}\n${i.body}`),
  ].join("\n\n");
  zip.file("report.txt", reportText);

  // CSV events
  const csvHeader = "minute,second,event_type,outcome,team,player,body_part,x,y,end_x,end_y,xg,tags";
  const csvRows = events.map((e) => {
    const team = e.team_id === (match as any).home_team_id ? home : away;
    const meta = e.metadata as any;
    return [
      e.minute, e.second, e.event_type, e.outcome ?? "",
      team, meta?.player_name ?? "", meta?.body_part ?? "",
      e.x ?? "", e.y ?? "", e.end_x ?? "", e.end_y ?? "",
      e.xg ?? "", e.tags.join("|"),
    ].join(",");
  });
  zip.file("events.csv", [csvHeader, ...csvRows].join("\n"));

  // Excel workbook as buffer
  const wb = XLSX.utils.book_new();
  const eventRows = events.map((e) => ({
    Minute: e.minute, Second: e.second, Type: e.event_type,
    Outcome: e.outcome ?? "",
    Team: e.team_id === (match as any).home_team_id ? home : away,
    Player: (e.metadata as any)?.player_name ?? "",
    xG: e.xg ?? "",
    Tags: e.tags.join(", "),
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(eventRows), "Events");
  const xlsxBuffer = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  zip.file("events.xlsx", xlsxBuffer);

  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, `match-export-${match.id.slice(0, 8)}.zip`);
}

// ── Video (Canvas recording) ──────────────────────────────────────────────────

export async function exportVideo(
  match: ExportMatch,
  events: ExportEvent[],
  onProgress?: (pct: number) => void
): Promise<void> {
  const W = 1280;
  const H = 820;
  const FPS = 30;
  const DURATION_S = 60; // 60s = 1 min replay compressed to ~1min real time
  const TOTAL_FRAMES = FPS * DURATION_S;
  const MAX_MINUTE = 90;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  const stream = canvas.captureStream(FPS);
  const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9" });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  const done = new Promise<void>((resolve) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      downloadBlob(blob, `match-replay-${match.id.slice(0, 8)}.webm`);
      resolve();
    };
  });

  recorder.start();

  const homeColor = match.home_team?.color ?? "#3b82f6";
  const awayColor = match.away_team?.color ?? "#ef4444";

  for (let frame = 0; frame < TOTAL_FRAMES; frame++) {
    const currentMinute = (frame / TOTAL_FRAMES) * MAX_MINUTE;
    const visibleEvents = events.filter(
      (e) => e.minute + e.second / 60 <= currentMinute
    );

    drawPitchFrame(ctx, W, H, match, visibleEvents, currentMinute, homeColor, awayColor);
    onProgress?.(Math.round((frame / TOTAL_FRAMES) * 100));

    // yield to browser between frames
    await new Promise((r) => setTimeout(r, 1000 / FPS));
  }

  recorder.stop();
  await done;
}

function drawPitchFrame(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  match: ExportMatch,
  events: ExportEvent[],
  currentMinute: number,
  homeColor: string,
  awayColor: string
) {
  const PW = W;
  const PH = H - 60; // leave 60px for header
  const scaleX = (x: number) => (x / 100) * PW;
  const scaleY = (y: number) => ((y / 100) * 64 / 100) * PH;

  // Header
  ctx.fillStyle = "#0f0f0f";
  ctx.fillRect(0, 0, W, 60);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 20px monospace";
  ctx.textAlign = "center";
  ctx.fillText(
    `${match.home_team?.short_name ?? "HME"} ${match.home_score} – ${match.away_score} ${match.away_team?.short_name ?? "AWY"}`,
    W / 2, 35
  );
  ctx.font = "14px monospace";
  ctx.fillStyle = "#888";
  ctx.fillText(`${Math.floor(currentMinute)}'`, W - 60, 35);

  // Pitch background
  ctx.fillStyle = "#2d5a27";
  ctx.fillRect(0, 60, PW, PH);

  // Stripes
  for (let i = 0; i < 10; i++) {
    if (i % 2 === 0) {
      ctx.fillStyle = "rgba(0,0,0,0.08)";
      ctx.fillRect((i / 10) * PW, 60, PW / 10, PH);
    }
  }

  // Lines
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 2;
  ctx.strokeRect(scaleX(1), 60 + scaleY(1.56), PW - scaleX(2), PH - scaleY(3.12));
  // Halfway
  ctx.beginPath();
  ctx.moveTo(PW / 2, 60);
  ctx.lineTo(PW / 2, 60 + PH);
  ctx.stroke();
  // Center circle
  ctx.beginPath();
  ctx.arc(PW / 2, 60 + PH / 2, (6 / 100) * PW, 0, Math.PI * 2);
  ctx.stroke();

  // Events
  for (const e of events) {
    if (e.x == null || e.y == null) continue;
    const isHome = e.team_id === (match as any).home_team_id;
    const color = isHome ? homeColor : awayColor;
    const ex = scaleX(e.x);
    const ey = 60 + scaleY(e.y);

    ctx.globalAlpha = 0.8;
    if (e.end_x != null && e.end_y != null) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(scaleX(e.end_x), 60 + scaleY(e.end_y));
      ctx.stroke();
    }
    ctx.fillStyle = e.event_type === "shot" ? "#fbbf24" : color;
    ctx.beginPath();
    ctx.arc(ex, ey, e.event_type === "shot" ? 5 : 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Legend
  ctx.font = "12px sans-serif";
  ctx.textAlign = "left";
  const dot = (x: number, y: number, color: string, label: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillText(label, x + 10, y + 4);
  };
  dot(16, 60 + PH - 20, homeColor, match.home_team?.short_name ?? "Home");
  dot(16 + 120, 60 + PH - 20, awayColor, match.away_team?.short_name ?? "Away");
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
