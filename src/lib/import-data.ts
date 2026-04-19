/**
 * Import utilities — parse JSON or CSV files into the event schema.
 * Maps external data to the internal event structure without touching the DB directly.
 */

export interface ImportedEvent {
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
  metadata: Record<string, unknown>;
  _team_hint?: "home" | "away"; // used for UI assignment
}

export interface ImportResult {
  events: ImportedEvent[];
  warnings: string[];
}

// ── JSON ─────────────────────────────────────────────────────────────────────

export function parseJSON(raw: string): ImportResult {
  const warnings: string[] = [];
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return { events: [], warnings: ["Invalid JSON — could not parse file."] };
  }

  // Support our own export format or a flat array of events
  let rawEvents: unknown[] = [];

  if (Array.isArray(parsed)) {
    rawEvents = parsed;
  } else if (typeof parsed === "object" && parsed !== null) {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.events)) {
      rawEvents = obj.events as unknown[];
    } else {
      warnings.push("No 'events' array found in JSON. Treating entire object as single event.");
      rawEvents = [parsed];
    }
  }

  const events: ImportedEvent[] = [];

  for (let i = 0; i < rawEvents.length; i++) {
    const raw = rawEvents[i];
    if (typeof raw !== "object" || raw === null) continue;
    const ev = raw as Record<string, unknown>;

    const event_type =
      (ev.event_type as string) || (ev.type as string) || (ev.Type as string);
    if (!event_type) {
      warnings.push(`Row ${i + 1}: Missing event_type — skipped.`);
      continue;
    }

    const minute = Number(ev.minute ?? ev.Minute ?? 0);
    const second = Number(ev.second ?? ev.Second ?? 0);
    const x = parseNum(ev.x ?? ev.X);
    const y = parseNum(ev.y ?? ev.Y);
    const end_x = parseNum(ev.end_x ?? ev["End X"] ?? ev.endX);
    const end_y = parseNum(ev.end_y ?? ev["End Y"] ?? ev.endY);
    const xg = parseNum(ev.xg ?? ev.xG ?? ev.XG);
    const outcome = (ev.outcome ?? ev.Outcome ?? null) as string | null;

    const rawTags = ev.tags ?? ev.Tags;
    let tags: string[] = [event_type];
    if (typeof rawTags === "string") {
      tags = rawTags.split(/[|,]/).map((t) => t.trim()).filter(Boolean);
    } else if (Array.isArray(rawTags)) {
      tags = rawTags.map(String);
    }

    // Team hint
    const teamField = (ev.team ?? ev.Team ?? "") as string;
    const teamHint = teamField.toLowerCase().includes("away")
      ? "away"
      : teamField.toLowerCase().includes("home")
      ? "home"
      : undefined;

    // Metadata: carry forward any extra fields
    const knownKeys = new Set([
      "event_type", "type", "Type", "minute", "Minute", "second", "Second",
      "x", "X", "y", "Y", "end_x", "end_y", "End X", "End Y", "endX", "endY",
      "xg", "xG", "XG", "outcome", "Outcome", "tags", "Tags", "team", "Team",
      "team_id", "player_id", "match_id", "id", "created_at",
    ]);
    const metadata: Record<string, unknown> = {
      ...(ev.metadata as Record<string, unknown>),
    };
    for (const [k, v] of Object.entries(ev)) {
      if (!knownKeys.has(k)) metadata[k] = v;
    }
    // Common player fields
    if (ev.player ?? ev.Player) metadata.player_name = ev.player ?? ev.Player;
    if (ev["Jersey #"] ?? ev.jersey_number) metadata.player_number = ev["Jersey #"] ?? ev.jersey_number;
    if (ev["Body Part"] ?? ev.body_part) metadata.body_part = ev["Body Part"] ?? ev.body_part;

    events.push({
      event_type,
      outcome,
      minute,
      second,
      x,
      y,
      end_x,
      end_y,
      tags,
      xg,
      metadata,
      _team_hint: teamHint,
    });
  }

  return { events, warnings };
}

// ── CSV ───────────────────────────────────────────────────────────────────────

export function parseCSV(raw: string): ImportResult {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return { events: [], warnings: ["CSV has no data rows."] };
  }

  const headers = splitCSVRow(lines[0]);
  const warnings: string[] = [];

  const rowObjects: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = splitCSVRow(lines[i]);
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h.trim()] = (vals[idx] ?? "").trim();
    });
    rowObjects.push(obj);
  }

  // Map CSV rows to JSON format and reuse parseJSON logic
  const mapped = rowObjects.map((row) => ({
    event_type: row.event_type ?? row.type ?? row.Type,
    outcome: row.outcome ?? row.Outcome ?? null,
    minute: row.minute ?? row.Minute,
    second: row.second ?? row.Second,
    x: row.x ?? row.X,
    y: row.y ?? row.Y,
    end_x: row.end_x ?? row["End X"],
    end_y: row.end_y ?? row["End Y"],
    xg: row.xg ?? row.xG,
    tags: row.tags ?? row.Tags,
    team: row.team ?? row.Team,
    player: row.player ?? row.Player,
    jersey_number: row["Jersey #"] ?? row.jersey_number,
    body_part: row["Body Part"] ?? row.body_part,
  }));

  return parseJSON(JSON.stringify(mapped));
}

// ── File reader ───────────────────────────────────────────────────────────────

export async function readImportFile(file: File): Promise<ImportResult> {
  const text = await file.text();
  const ext = file.name.split(".").pop()?.toLowerCase();

  if (ext === "json") return parseJSON(text);
  if (ext === "csv") return parseCSV(text);

  // Try JSON first, then CSV
  try {
    const result = parseJSON(text);
    if (result.events.length > 0) return result;
  } catch {}
  return parseCSV(text);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseNum(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

function splitCSVRow(line: string): string[] {
  const result: string[] = [];
  let inQuotes = false;
  let current = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}
