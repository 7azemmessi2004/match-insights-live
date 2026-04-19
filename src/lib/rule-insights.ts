/**
 * Rule-based match analysis — no real ML.
 * Generates match summaries and player-level analysis from events.
 */

export interface AnalysisEvent {
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

export interface AnalysisMatch {
  id: string;
  home_team_id: string;
  away_team_id: string;
  home_score: number;
  away_score: number;
  home_team: { name: string; short_name: string } | null;
  away_team: { name: string; short_name: string } | null;
  competition?: string | null;
}

export interface GeneratedInsight {
  kind: "tactical" | "warning" | "player" | "match";
  title: string;
  body: string;
  severity: "info" | "warning" | "critical";
}

export function generateRuleInsights(
  match: AnalysisMatch,
  events: AnalysisEvent[]
): GeneratedInsight[] {
  const insights: GeneratedInsight[] = [];
  const homeId = match.home_team_id;
  const awayId = match.away_team_id;
  const homeName = match.home_team?.short_name ?? "Home";
  const awayName = match.away_team?.short_name ?? "Away";

  const home = events.filter((e) => e.team_id === homeId);
  const away = events.filter((e) => e.team_id === awayId);

  // ── Possession ────────────────────────────────────────────────────────────
  const homePass = home.filter((e) => e.event_type === "pass").length;
  const awayPass = away.filter((e) => e.event_type === "pass").length;
  const totalPass = homePass + awayPass || 1;
  const homePos = Math.round((homePass / totalPass) * 100);

  if (homePos >= 65) {
    insights.push({
      kind: "tactical",
      title: `${homeName} dominated possession (${homePos}%)`,
      body: `${homeName} controlled the ball with ${homePass} passes vs ${awayName}'s ${awayPass}. This level of dominance creates high-quality attacking opportunities.`,
      severity: "info",
    });
  } else if (homePos <= 35) {
    insights.push({
      kind: "warning",
      title: `${homeName} struggled to hold the ball (${homePos}%)`,
      body: `${awayName} outpassed ${homeName} ${awayPass} to ${homePass}. ${homeName} may need to press higher or adjust their build-up shape.`,
      severity: "warning",
    });
  }

  // ── xG analysis ───────────────────────────────────────────────────────────
  const homeXG = home.reduce((s, e) => s + (e.xg ?? 0), 0);
  const awayXG = away.reduce((s, e) => s + (e.xg ?? 0), 0);

  if (homeXG > 0 || awayXG > 0) {
    const diff = Math.abs(homeXG - awayXG);
    if (diff > 0.8) {
      const dominantTeam = homeXG > awayXG ? homeName : awayName;
      const dominantXG = Math.max(homeXG, awayXG).toFixed(2);
      const weakerXG = Math.min(homeXG, awayXG).toFixed(2);
      insights.push({
        kind: "tactical",
        title: `${dominantTeam} generated significantly more xG (${dominantXG} vs ${weakerXG})`,
        body: `The xG gap of ${diff.toFixed(2)} reflects a clear difference in shot quality. ${dominantTeam} created more dangerous chances from closer range or better angles.`,
        severity: "info",
      });
    }

    // Score vs xG mismatch
    const homeScoreVsXG = match.home_score - homeXG;
    const awayScoreVsXG = match.away_score - awayXG;
    if (homeScoreVsXG > 1.5) {
      insights.push({
        kind: "match",
        title: `${homeName} overperformed their xG`,
        body: `${homeName} scored ${match.home_score} goals against an expected ${homeXG.toFixed(2)} xG — ${homeScoreVsXG.toFixed(1)} goals above model expectation. Clinical finishing or favourable deflections contributed.`,
        severity: "info",
      });
    }
    if (awayScoreVsXG > 1.5) {
      insights.push({
        kind: "match",
        title: `${awayName} overperformed their xG`,
        body: `${awayName} scored ${match.away_score} goals against an expected ${awayXG.toFixed(2)} xG — ${awayScoreVsXG.toFixed(1)} goals above model expectation.`,
        severity: "info",
      });
    }
  }

  // ── Shots ─────────────────────────────────────────────────────────────────
  const homeShots = home.filter((e) => e.event_type === "shot");
  const awayShots = away.filter((e) => e.event_type === "shot");
  const homeShotsOT = homeShots.filter((e) => e.outcome === "on_target" || e.outcome === "goal").length;
  const awayShotsOT = awayShots.filter((e) => e.outcome === "on_target" || e.outcome === "goal").length;

  if (homeShots.length >= 3) {
    const acc = Math.round((homeShotsOT / homeShots.length) * 100);
    if (acc >= 70) {
      insights.push({
        kind: "tactical",
        title: `${homeName} were very accurate in front of goal (${acc}% shots on target)`,
        body: `${homeShotsOT} of ${homeShots.length} shots hit the target — excellent accuracy that put pressure on the goalkeeper.`,
        severity: "info",
      });
    } else if (acc < 30 && homeShots.length >= 5) {
      insights.push({
        kind: "warning",
        title: `${homeName}'s shooting accuracy was poor (${acc}%)`,
        body: `Only ${homeShotsOT} of ${homeShots.length} shots were on target. Better decision-making in the final third or working the ball into better positions is recommended.`,
        severity: "warning",
      });
    }
  }

  // ── High press ────────────────────────────────────────────────────────────
  const homeHighPress = home.filter((e) => e.tags.includes("high_press")).length;
  const awayHighPress = away.filter((e) => e.tags.includes("high_press")).length;

  if (homeHighPress >= 4) {
    insights.push({
      kind: "tactical",
      title: `${homeName} pressed aggressively in the opposition half (${homeHighPress} high-press actions)`,
      body: `A high defensive line contributed to winning the ball in dangerous areas. This creates transition opportunities but leaves space behind.`,
      severity: "info",
    });
  }
  if (awayHighPress >= 4) {
    insights.push({
      kind: "warning",
      title: `${awayName} pressed high and won the ball ${awayHighPress} times in ${homeName}'s half`,
      body: `${awayName}'s pressing intensity forced errors from ${homeName} in their own territory. Consider using longer passes or a more direct build-up.`,
      severity: "warning",
    });
  }

  // ── Tactical patterns ─────────────────────────────────────────────────────
  const homeCrosses = home.filter((e) => e.event_type === "cross").length;
  const awayCrosses = away.filter((e) => e.event_type === "cross").length;
  if (homeCrosses >= 6) {
    insights.push({
      kind: "tactical",
      title: `${homeName} relied heavily on wide play (${homeCrosses} crosses)`,
      body: `Frequent crossing suggests ${homeName} targeted the flanks as their primary attacking route. Conversion rate from crosses should be monitored.`,
      severity: "info",
    });
  }

  const homeLongBalls = home.filter((e) => e.tags.includes("long_ball")).length;
  if (homeLongBalls >= 8) {
    insights.push({
      kind: "tactical",
      title: `${homeName} played a direct style (${homeLongBalls} long balls)`,
      body: `High number of long passes indicates a more direct approach, possibly bypassing a high press or targeting physical wingers/strikers.`,
      severity: "info",
    });
  }

  // ── Fouls / discipline ────────────────────────────────────────────────────
  const homeFouls = home.filter((e) => e.event_type === "foul").length;
  const awayFouls = away.filter((e) => e.event_type === "foul").length;
  if (homeFouls >= 8) {
    insights.push({
      kind: "warning",
      title: `${homeName} committed ${homeFouls} fouls — disciplinary risk`,
      body: `Excessive fouling can lead to yellow/red cards and dangerous free-kick opportunities for the opposition. Defensive discipline needs review.`,
      severity: "warning",
    });
  }

  // ── Final third entries ───────────────────────────────────────────────────
  const homeFinalThird = home.filter((e) => e.tags.includes("final_third_entry")).length;
  const awayFinalThird = away.filter((e) => e.tags.includes("final_third_entry")).length;
  if (homeFinalThird > awayFinalThird * 1.5 && homeFinalThird >= 5) {
    insights.push({
      kind: "tactical",
      title: `${homeName} penetrated the final third far more frequently`,
      body: `${homeFinalThird} final-third entries vs ${awayFinalThird} shows ${homeName} controlled the attacking rhythm and created more dangerous positions.`,
      severity: "info",
    });
  }

  // ── Player analysis ───────────────────────────────────────────────────────
  const playerInsights = generatePlayerInsights(events, match);
  insights.push(...playerInsights);

  return insights;
}

function generatePlayerInsights(
  events: AnalysisEvent[],
  match: AnalysisMatch
): GeneratedInsight[] {
  const insights: GeneratedInsight[] = [];

  // Group by player name (from metadata)
  const playerMap = new Map<string, AnalysisEvent[]>();
  for (const e of events) {
    const name = (e.metadata as any)?.player_name as string | undefined;
    if (!name) continue;
    if (!playerMap.has(name)) playerMap.set(name, []);
    playerMap.get(name)!.push(e);
  }

  for (const [name, playerEvents] of playerMap.entries()) {
    if (playerEvents.length < 3) continue;

    const passes = playerEvents.filter((e) => e.event_type === "pass").length;
    const shots = playerEvents.filter((e) => e.event_type === "shot");
    const xg = shots.reduce((s, e) => s + (e.xg ?? 0), 0);
    const goals = shots.filter((e) => e.outcome === "goal").length;
    const tackles = playerEvents.filter((e) => e.event_type === "tackle").length;
    const keyPasses = playerEvents.filter((e) => e.tags.includes("key_pass")).length;
    const progressivePasses = playerEvents.filter((e) => e.tags.includes("progressive_pass")).length;

    // Star performer
    if (shots.length >= 3 && xg >= 0.8) {
      insights.push({
        kind: "player",
        title: `${name} was a constant goal threat`,
        body: `${shots.length} shots generating ${xg.toFixed(2)} xG${goals > 0 ? `, scoring ${goals} goal${goals > 1 ? "s" : ""}` : ""}. High-volume, high-quality shooter.`,
        severity: "info",
      });
    }

    if (keyPasses >= 2) {
      insights.push({
        kind: "player",
        title: `${name} was a creative hub (${keyPasses} key passes)`,
        body: `Delivered ${keyPasses} key passes and ${progressivePasses} progressive passes, acting as a consistent chance creator.`,
        severity: "info",
      });
    }

    if (tackles >= 4) {
      insights.push({
        kind: "player",
        title: `${name} was dominant defensively (${tackles} tackles)`,
        body: `High tackle count signals an active defensive role, breaking up opposition attacks in the midfield or defensive zones.`,
        severity: "info",
      });
    }

    if (passes >= 15 && progressivePasses >= 5) {
      insights.push({
        kind: "player",
        title: `${name} drove play forward with ${passes} passes (${progressivePasses} progressive)`,
        body: `Heavy involvement in build-up with a focus on forward progression, consistently moving the team up the pitch.`,
        severity: "info",
      });
    }
  }

  return insights;
}

/** Generate match summary text */
export function generateMatchSummary(
  match: AnalysisMatch,
  events: AnalysisEvent[]
): string {
  const homeName = match.home_team?.name ?? "Home";
  const awayName = match.away_team?.name ?? "Away";
  const home = events.filter((e) => e.team_id === match.home_team_id);
  const away = events.filter((e) => e.team_id === match.away_team_id);
  const homePass = home.filter((e) => e.event_type === "pass").length;
  const awayPass = away.filter((e) => e.event_type === "pass").length;
  const totalPass = homePass + awayPass || 1;
  const homePos = Math.round((homePass / totalPass) * 100);
  const homeXG = home.reduce((s, e) => s + (e.xg ?? 0), 0);
  const awayXG = away.reduce((s, e) => s + (e.xg ?? 0), 0);
  const homeShots = home.filter((e) => e.event_type === "shot").length;
  const awayShots = away.filter((e) => e.event_type === "shot").length;

  const winner =
    match.home_score > match.away_score
      ? homeName
      : match.away_score > match.home_score
      ? awayName
      : null;

  const result = winner
    ? `${winner} won ${Math.max(match.home_score, match.away_score)}–${Math.min(match.home_score, match.away_score)}`
    : `The match ended ${match.home_score}–${match.away_score} — a draw`;

  const xgWinner =
    homeXG > awayXG ? homeName : awayXG > homeXG ? awayName : null;

  return [
    `${result}.`,
    `${homeName} had ${homePos}% possession (${homePass} passes) while ${awayName} made ${awayPass} passes.`,
    homeShots > 0 || awayShots > 0
      ? `Shots: ${homeName} ${homeShots} – ${awayShots} ${awayName}. xG: ${homeXG.toFixed(2)} – ${awayXG.toFixed(2)}.`
      : "",
    xgWinner
      ? `${xgWinner} created better quality chances based on expected goals model.`
      : "Both teams created similar quality chances.",
    events.length < 10 ? "Note: Limited events were tracked — insights may not be fully representative." : "",
  ]
    .filter(Boolean)
    .join(" ");
}
