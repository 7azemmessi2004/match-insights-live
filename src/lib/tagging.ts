/**
 * Rule-based tagging engine.
 * Derives high-level tags from raw event attributes — no hardcoded business decisions in components.
 * Extensible: add a rule object to RULES; engine evaluates all matching rules per event.
 */

export interface RawEvent {
  event_type: string;
  outcome?: string | null;
  x?: number | null;
  y?: number | null;
  end_x?: number | null;
  end_y?: number | null;
  team_id?: string | null;
  // Direction of attack: home attacks toward x=100, away toward x=0
  attacking_direction?: "left_to_right" | "right_to_left";
}

interface Rule {
  tag: string;
  category: "offensive" | "defensive" | "ball" | "tactical";
  match: (e: RawEvent) => boolean;
}

const dist = (e: RawEvent) => {
  if (e.x == null || e.y == null || e.end_x == null || e.end_y == null) return 0;
  const dx = e.end_x - e.x;
  const dy = e.end_y - e.y;
  return Math.sqrt(dx * dx + dy * dy);
};

const isAttackingRight = (e: RawEvent) => e.attacking_direction !== "right_to_left";

const RULES: Rule[] = [
  // Ball
  { tag: "long_ball", category: "ball", match: (e) => e.event_type === "pass" && dist(e) > 35 },
  { tag: "short_pass", category: "ball", match: (e) => e.event_type === "pass" && dist(e) > 0 && dist(e) <= 12 },
  { tag: "cross", category: "ball", match: (e) => e.event_type === "cross" },
  { tag: "switch_of_play", category: "ball", match: (e) => e.event_type === "pass" && Math.abs((e.end_y ?? 50) - (e.y ?? 50)) > 40 },
  // Offensive
  {
    tag: "progressive_pass",
    category: "offensive",
    match: (e) => {
      if (e.event_type !== "pass" || e.x == null || e.end_x == null) return false;
      const delta = isAttackingRight(e) ? e.end_x - e.x : e.x - e.end_x;
      return delta > 18;
    },
  },
  {
    tag: "final_third_entry",
    category: "offensive",
    match: (e) => {
      if (e.event_type !== "pass" && e.event_type !== "carry") return false;
      const startInThird = isAttackingRight(e) ? (e.x ?? 0) < 66 : (e.x ?? 0) > 33;
      const endInThird = isAttackingRight(e) ? (e.end_x ?? 0) >= 66 : (e.end_x ?? 0) <= 33;
      return startInThird && endInThird;
    },
  },
  {
    tag: "key_pass",
    category: "offensive",
    match: (e) => e.event_type === "pass" && (e.outcome === "assist" || e.outcome === "key"),
  },
  { tag: "shot_on_target", category: "offensive", match: (e) => e.event_type === "shot" && (e.outcome === "on_target" || e.outcome === "goal") },
  { tag: "goal", category: "offensive", match: (e) => e.event_type === "shot" && e.outcome === "goal" },
  {
    tag: "box_entry",
    category: "offensive",
    match: (e) => {
      if (e.end_x == null || e.end_y == null) return false;
      const inBoxX = isAttackingRight(e) ? e.end_x >= 83 : e.end_x <= 17;
      const inBoxY = e.end_y >= 21 && e.end_y <= 79;
      return inBoxX && inBoxY;
    },
  },
  // Defensive
  { tag: "tackle", category: "defensive", match: (e) => e.event_type === "tackle" },
  { tag: "interception", category: "defensive", match: (e) => e.event_type === "interception" },
  { tag: "block", category: "defensive", match: (e) => e.event_type === "block" },
  {
    tag: "high_press",
    category: "tactical",
    match: (e) => {
      if (!["tackle", "interception", "foul"].includes(e.event_type)) return false;
      if (e.x == null) return false;
      // Defensive action in opposition half
      return isAttackingRight(e) ? e.x > 60 : e.x < 40;
    },
  },
  { tag: "foul", category: "defensive", match: (e) => e.event_type === "foul" },
  // Tactical states (set on shots in dangerous zones)
  {
    tag: "dangerous_situation",
    category: "tactical",
    match: (e) => {
      if (e.event_type !== "shot") return false;
      if (e.x == null || e.y == null) return false;
      const xZone = isAttackingRight(e) ? e.x >= 83 : e.x <= 17;
      const yZone = e.y >= 30 && e.y <= 70;
      return xZone && yZone;
    },
  },
];

export function deriveTags(e: RawEvent): string[] {
  const tags = new Set<string>();
  tags.add(e.event_type);
  if (e.outcome) tags.add(`${e.event_type}:${e.outcome}`);
  for (const r of RULES) {
    try {
      if (r.match(e)) tags.add(r.tag);
    } catch {
      // ignore rule errors
    }
  }
  return Array.from(tags);
}

/**
 * Simple xG model — distance + angle to goal.
 * Production: replace with calibrated logistic regression / gradient-boosted model.
 */
export function estimateXG(e: RawEvent): number {
  if (e.event_type !== "shot" || e.x == null || e.y == null) return 0;
  const goalX = e.attacking_direction === "right_to_left" ? 0 : 100;
  const dx = goalX - e.x;
  const dy = 50 - e.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.abs(Math.atan2(7.32 / 2, distance)); // goal width ~ 7.32m, normalized
  // Logistic-ish: closer + better angle = higher xG
  const distanceFactor = Math.max(0, 1 - distance / 60);
  const angleFactor = Math.min(1, angle * 6);
  const raw = 0.05 + 0.7 * distanceFactor * angleFactor;
  return Math.round(raw * 1000) / 1000;
}

export const EVENT_TYPES = [
  { type: "pass", label: "Pass", color: "var(--color-primary)" },
  { type: "shot", label: "Shot", color: "var(--color-warning)" },
  { type: "tackle", label: "Tackle", color: "var(--color-success)" },
  { type: "interception", label: "Interception", color: "var(--color-success)" },
  { type: "dribble", label: "Dribble", color: "var(--color-chart-5)" },
  { type: "cross", label: "Cross", color: "var(--color-chart-3)" },
  { type: "foul", label: "Foul", color: "var(--color-destructive)" },
  { type: "save", label: "Save", color: "var(--color-chart-4)" },
  { type: "carry", label: "Carry", color: "var(--color-chart-2)" },
  { type: "block", label: "Block", color: "var(--color-muted-foreground)" },
] as const;

export type EventTypeKey = (typeof EVENT_TYPES)[number]["type"];
