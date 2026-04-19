import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
  ScatterChart, Scatter, Cell,
} from "recharts";

interface Event {
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
  metadata: Record<string, unknown>;
}

interface Team { id: string; name: string; short_name: string; color: string }
interface Match { home_team_id: string; away_team_id: string; home_team: Team | null; away_team: Team | null }

interface Props { events: Event[]; match: Match }

export function AnalyticsTab({ events, match }: Props) {
  const homeId = match.home_team_id;
  const awayId = match.away_team_id;
  const homeName = match.home_team?.short_name ?? "Home";
  const awayName = match.away_team?.short_name ?? "Away";
  const homeColor = match.home_team?.color ?? "#3b82f6";
  const awayColor = match.away_team?.color ?? "#ef4444";

  // ── Event distribution per type ───────────────────────────────────────────
  const eventTypeDist = useMemo(() => {
    const types = [...new Set(events.map((e) => e.event_type))];
    return types.map((type) => ({
      type: type.charAt(0).toUpperCase() + type.slice(1),
      home: events.filter((e) => e.event_type === type && e.team_id === homeId).length,
      away: events.filter((e) => e.event_type === type && e.team_id === awayId).length,
    })).sort((a, b) => (b.home + b.away) - (a.home + a.away));
  }, [events, homeId, awayId]);

  // ── xG timeline (per 5 min bucket) ───────────────────────────────────────
  const xgTimeline = useMemo(() => {
    const buckets: Record<number, { minute: number; home: number; away: number }> = {};
    for (let m = 0; m <= 90; m += 5) buckets[m] = { minute: m, home: 0, away: 0 };
    for (const e of events) {
      if ((e.xg ?? 0) === 0) continue;
      const bucket = Math.floor(e.minute / 5) * 5;
      if (buckets[bucket]) {
        if (e.team_id === homeId) buckets[bucket].home += e.xg ?? 0;
        else buckets[bucket].away += e.xg ?? 0;
      }
    }
    return Object.values(buckets).map((b) => ({
      minute: `${b.minute}'`,
      [homeName]: parseFloat(b.home.toFixed(3)),
      [awayName]: parseFloat(b.away.toFixed(3)),
    }));
  }, [events, homeId, awayId, homeName, awayName]);

  // ── Player activity (by player_name in metadata) ──────────────────────────
  const playerActivity = useMemo(() => {
    const map = new Map<string, { name: string; actions: number; passes: number; shots: number; xg: number }>();
    for (const e of events) {
      const name = (e.metadata?.player_name as string) ?? null;
      if (!name) continue;
      const cur = map.get(name) ?? { name, actions: 0, passes: 0, shots: 0, xg: 0 };
      cur.actions++;
      if (e.event_type === "pass") cur.passes++;
      if (e.event_type === "shot") { cur.shots++; cur.xg += e.xg ?? 0; }
      map.set(name, cur);
    }
    return [...map.values()]
      .sort((a, b) => b.actions - a.actions)
      .slice(0, 12)
      .map((p) => ({ ...p, xg: parseFloat(p.xg.toFixed(2)) }));
  }, [events]);

  // ── Minute-by-minute activity (pressure map) ──────────────────────────────
  const minuteActivity = useMemo(() => {
    const buckets: Record<number, { minute: number; home: number; away: number }> = {};
    for (let m = 0; m <= 90; m += 3) buckets[m] = { minute: m, home: 0, away: 0 };
    for (const e of events) {
      const bucket = Math.floor(e.minute / 3) * 3;
      if (buckets[bucket]) {
        if (e.team_id === homeId) buckets[bucket].home++;
        else buckets[bucket].away++;
      }
    }
    return Object.values(buckets).map((b) => ({
      min: `${b.minute}'`,
      [homeName]: b.home,
      [awayName]: -b.away, // negative for "mirrored" bar
    }));
  }, [events, homeId, awayId, homeName, awayName]);

  return (
    <div className="space-y-6 overflow-y-auto p-4 pb-8">
      {/* Event type distribution */}
      <section>
        <SectionTitle>Event Distribution</SectionTitle>
        {eventTypeDist.length === 0 ? (
          <EmptyState>No events to show</EmptyState>
        ) : (
          <div className="h-56 rounded-lg border border-border bg-background/50 p-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={eventTypeDist} margin={{ left: -20, right: 8, top: 4, bottom: 4 }}>
                <XAxis dataKey="type" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} />
                <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} />
                <Tooltip
                  contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="home" name={homeName} fill={homeColor} radius={[3,3,0,0]} maxBarSize={28} />
                <Bar dataKey="away" name={awayName} fill={awayColor} radius={[3,3,0,0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* xG timeline */}
      <section>
        <SectionTitle>xG Timeline (per 5 min)</SectionTitle>
        <div className="h-48 rounded-lg border border-border bg-background/50 p-3">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={xgTimeline} margin={{ left: -20, right: 8, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="minute" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} interval={3} />
              <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} />
              <Tooltip
                contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey={homeName} stroke={homeColor} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey={awayName} stroke={awayColor} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Activity map (mirrored bar per 3 mins) */}
      <section>
        <SectionTitle>Match Intensity (events per 3 min)</SectionTitle>
        <div className="h-44 rounded-lg border border-border bg-background/50 p-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={minuteActivity} margin={{ left: -20, right: 8, top: 4, bottom: 4 }}>
              <XAxis dataKey="min" tick={{ fontSize: 9, fill: "var(--color-muted-foreground)" }} interval={5} />
              <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                tickFormatter={(v) => String(Math.abs(v))} />
              <Tooltip
                contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", fontSize: 12 }}
                formatter={(v: number) => [Math.abs(v), ""]}
              />
              <Bar dataKey={homeName} fill={homeColor} radius={[2,2,0,0]} maxBarSize={18} />
              <Bar dataKey={awayName} fill={awayColor} radius={[0,0,2,2]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Player activity table */}
      {playerActivity.length > 0 && (
        <section>
          <SectionTitle>Player Activity</SectionTitle>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-surface">
                <tr className="text-left text-muted-foreground">
                  <th className="px-3 py-2">Player</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                  <th className="px-3 py-2 text-right">Passes</th>
                  <th className="px-3 py-2 text-right">Shots</th>
                  <th className="px-3 py-2 text-right">xG</th>
                </tr>
              </thead>
              <tbody>
                {playerActivity.map((p, i) => (
                  <tr key={p.name} className="border-t border-border hover:bg-surface/50">
                    <td className="px-3 py-2 font-medium">{p.name}</td>
                    <td className="px-3 py-2 text-right font-mono">{p.actions}</td>
                    <td className="px-3 py-2 text-right font-mono">{p.passes}</td>
                    <td className="px-3 py-2 text-right font-mono">{p.shots}</td>
                    <td className={`px-3 py-2 text-right font-mono ${p.xg > 0 ? "text-yellow-400" : "text-muted-foreground"}`}>
                      {p.xg > 0 ? p.xg.toFixed(2) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {playerActivity.length > 0 && (
        <section>
          <SectionTitle>Player Actions Bar</SectionTitle>
          <div className="h-56 rounded-lg border border-border bg-background/50 p-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={playerActivity} layout="vertical" margin={{ left: 64, right: 12, top: 4, bottom: 4 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} width={60} />
                <Tooltip contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", fontSize: 12 }} />
                <Bar dataKey="passes" name="Passes" stackId="a" fill={homeColor} />
                <Bar dataKey="shots" name="Shots" stackId="a" fill="#fbbf24" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
      {children}
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="py-8 text-center text-xs text-muted-foreground">{children}</div>
  );
}
