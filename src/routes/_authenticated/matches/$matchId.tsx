import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Sparkles, Download, Play, Pause, FastForward } from "lucide-react";
import { Pitch, yToSvg } from "@/components/pitch/Pitch";
import { Heatmap } from "@/components/pitch/Heatmap";
import { PassNetwork } from "@/components/pitch/PassNetwork";
import { EVENT_TYPES, deriveTags, estimateXG } from "@/lib/tagging";
import { useAuth, canWrite } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/matches/$matchId")({
  component: MatchPage,
});

interface Team { id: string; name: string; short_name: string; color: string }
interface Match {
  id: string; status: string; home_score: number; away_score: number;
  home_team_id: string; away_team_id: string; competition: string | null;
  home_team: Team | null; away_team: Team | null;
}
interface Event {
  id: string; match_id: string; team_id: string | null; player_id: string | null;
  event_type: string; outcome: string | null; minute: number; second: number;
  x: number | null; y: number | null; end_x: number | null; end_y: number | null;
  tags: string[]; xg: number | null; created_at: string;
}
interface Insight {
  id: string; kind: string; title: string; body: string; severity: string; created_at: string;
}

function MatchPage() {
  const { matchId } = Route.useParams();
  const auth = useAuth();
  const allowWrite = canWrite(auth.roles);
  const qc = useQueryClient();

  const matchQ = useQuery({
    queryKey: ["match", matchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("matches")
        .select("*,home_team:teams!matches_home_team_id_fkey(*),away_team:teams!matches_away_team_id_fkey(*)")
        .eq("id", matchId).single();
      if (error) throw error;
      return data as unknown as Match;
    },
  });

  const eventsQ = useQuery({
    queryKey: ["events", matchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events").select("*").eq("match_id", matchId)
        .order("minute", { ascending: true }).order("second", { ascending: true });
      if (error) throw error;
      return data as Event[];
    },
    refetchInterval: 5000,
  });

  const insightsQ = useQuery({
    queryKey: ["insights", matchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("insights").select("*").eq("match_id", matchId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Insight[];
    },
  });

  const events = eventsQ.data ?? [];
  const match = matchQ.data;

  // Tagging form state
  const [pendingType, setPendingType] = useState<string>("pass");
  const [pendingTeam, setPendingTeam] = useState<"home" | "away">("home");
  const [pendingMinute, setPendingMinute] = useState(0);
  const [pendingStart, setPendingStart] = useState<{ x: number; y: number } | null>(null);

  // Replay
  const [replayMin, setReplayMin] = useState(90);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setReplayMin((m) => (m >= 90 ? 0 : m + 0.25 * speed));
    }, 250);
    return () => clearInterval(id);
  }, [playing, speed]);

  const visibleEvents = useMemo(
    () => events.filter((e) => e.minute + e.second / 60 <= replayMin),
    [events, replayMin]
  );

  const addEvent = useMutation({
    mutationFn: async (payload: {
      type: string; team_id: string; minute: number;
      x?: number; y?: number; end_x?: number; end_y?: number;
      outcome?: string; attacking_left_to_right: boolean;
    }) => {
      const raw = {
        event_type: payload.type, outcome: payload.outcome ?? null,
        x: payload.x, y: payload.y, end_x: payload.end_x, end_y: payload.end_y,
        attacking_direction: payload.attacking_left_to_right ? "left_to_right" : "right_to_left",
      } as const;
      const tags = deriveTags(raw);
      const xg = estimateXG(raw);
      const { error } = await supabase.from("events").insert({
        match_id: matchId, team_id: payload.team_id, event_type: payload.type,
        outcome: payload.outcome ?? null, minute: Math.floor(payload.minute),
        second: Math.round((payload.minute % 1) * 60),
        x: payload.x, y: payload.y, end_x: payload.end_x, end_y: payload.end_y,
        tags, xg: xg || null,
      });
      if (error) throw error;

      // If goal, bump score
      if (payload.type === "shot" && payload.outcome === "goal" && match) {
        const isHome = payload.team_id === match.home_team_id;
        await supabase.from("matches").update({
          home_score: match.home_score + (isHome ? 1 : 0),
          away_score: match.away_score + (isHome ? 0 : 1),
        }).eq("id", matchId);
        qc.invalidateQueries({ queryKey: ["match", matchId] });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["events", matchId] });
      setPendingStart(null);
      setReplayMin(90);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const onPitchClick = (x: number, y: number) => {
    if (!allowWrite || !match) return;
    const teamId = pendingTeam === "home" ? match.home_team_id : match.away_team_id;
    const needsEnd = ["pass", "cross", "carry"].includes(pendingType);

    if (needsEnd) {
      if (!pendingStart) {
        setPendingStart({ x, y });
        return;
      }
      addEvent.mutate({
        type: pendingType, team_id: teamId, minute: pendingMinute,
        x: pendingStart.x, y: pendingStart.y, end_x: x, end_y: y,
        attacking_left_to_right: pendingTeam === "home",
      });
    } else {
      const outcome = pendingType === "shot" ? "on_target" : undefined;
      addEvent.mutate({
        type: pendingType, team_id: teamId, minute: pendingMinute,
        x, y, outcome, attacking_left_to_right: pendingTeam === "home",
      });
    }
  };

  // AI
  const runAI = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("match-insights", {
        body: { matchId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["insights", matchId] });
      toast.success("AI insights generated");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "AI failed"),
  });

  // Export
  const exportMatch = () => {
    const payload = {
      match, events, insights: insightsQ.data ?? [],
      exported_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `match-${matchId}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Match exported");
  };

  if (!match) return <div className="p-12 text-sm text-muted-foreground">Loading match…</div>;

  // Stats
  const stats = computeStats(events, match);

  // Pass network for selected team
  const homeEvents = events.filter((e) => e.team_id === match.home_team_id);
  const homeNet = buildPassNetwork(homeEvents);

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border bg-surface px-6 py-3">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" />
          </Link>
          <div className="flex items-center gap-3">
            <TeamPill team={match.home_team} />
            <div className="font-mono text-2xl font-bold tabular-nums">
              {match.home_score} <span className="text-muted-foreground">–</span> {match.away_score}
            </div>
            <TeamPill team={match.away_team} reverse />
          </div>
          <div className="ml-2 rounded-md bg-destructive/10 px-2 py-0.5 font-mono text-xs font-semibold text-destructive">
            {Math.floor(replayMin)}:{String(Math.floor((replayMin % 1) * 60)).padStart(2, "0")}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => runAI.mutate()} disabled={runAI.isPending || events.length < 5}>
            <Sparkles className="mr-1.5 size-3.5" />
            {runAI.isPending ? "Analysing…" : "AI insights"}
          </Button>
          <Button size="sm" variant="ghost" onClick={exportMatch}>
            <Download className="mr-1.5 size-3.5" /> Export
          </Button>
        </div>
      </header>

      {/* Stats strip */}
      <div className="grid grid-cols-5 border-b border-border bg-background">
        <Stat label="Possession" value={`${stats.posHome}%`} sub={`${stats.posAway}% away`} />
        <Stat label="xG" value={`${stats.xgHome.toFixed(2)} – ${stats.xgAway.toFixed(2)}`} />
        <Stat label="Shots" value={`${stats.shotsHome} – ${stats.shotsAway}`} />
        <Stat label="Passes" value={`${stats.passHome} – ${stats.passAway}`} />
        <Stat label="PPDA" value={stats.ppda.toFixed(1)} sub="def. actions / opp. pass" />
      </div>

      {/* Body */}
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_360px]">
        <div className="flex min-h-0 flex-col p-6">
          <Tabs defaultValue="live" className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between">
              <TabsList>
                <TabsTrigger value="live">Tag</TabsTrigger>
                <TabsTrigger value="heatmap">Heatmap</TabsTrigger>
                <TabsTrigger value="passes">Pass network</TabsTrigger>
              </TabsList>

              {/* Replay controls */}
              <div className="flex items-center gap-3">
                <Button size="icon" variant="ghost" onClick={() => setPlaying((p) => !p)}>
                  {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
                </Button>
                <div className="w-64">
                  <Slider
                    value={[replayMin]}
                    min={0} max={90} step={0.25}
                    onValueChange={(v) => { setReplayMin(v[0]); setPlaying(false); }}
                  />
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <FastForward className="size-3" />
                  <select
                    value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))}
                    className="rounded bg-surface px-1 py-0.5 font-mono"
                  >
                    {[0.5, 1, 2, 4, 8].map((s) => <option key={s} value={s}>{s}x</option>)}
                  </select>
                </div>
              </div>
            </div>

            <TabsContent value="live" className="mt-4 min-h-0 flex-1">
              <div className="panel-elevated flex h-full flex-col p-4">
                {allowWrite && (
                  <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
                    <Select value={pendingTeam} onValueChange={(v) => setPendingTeam(v as "home" | "away")}>
                      <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="home">{match.home_team?.short_name}</SelectItem>
                        <SelectItem value="away">{match.away_team?.short_name}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={pendingType} onValueChange={setPendingType}>
                      <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {EVENT_TYPES.map((t) => <SelectItem key={t.type} value={t.type}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <input
                      type="number"
                      value={pendingMinute}
                      onChange={(e) => setPendingMinute(Number(e.target.value))}
                      className="h-8 w-16 rounded-md border border-border bg-background px-2 font-mono"
                      min={0} max={120}
                    />
                    <span className="text-muted-foreground">
                      {pendingStart
                        ? "Click END location"
                        : `Click pitch to ${["pass","cross","carry"].includes(pendingType) ? "set START" : "log event"}`}
                    </span>
                    {pendingStart && (
                      <Button size="sm" variant="ghost" onClick={() => setPendingStart(null)}>Cancel</Button>
                    )}
                  </div>
                )}
                <div className="flex-1">
                  <Pitch onClick={onPitchClick} className="h-full w-full">
                    {visibleEvents.map((e) => (
                      <EventMarker key={e.id} e={e} match={match} />
                    ))}
                    {pendingStart && (
                      <circle cx={pendingStart.x} cy={yToSvg(pendingStart.y)} r="1.2"
                        fill="var(--color-warning)" stroke="white" strokeWidth="0.3" />
                    )}
                  </Pitch>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="heatmap" className="mt-4 min-h-0 flex-1">
              <div className="grid h-full grid-cols-2 gap-4">
                <div className="panel-elevated p-3">
                  <div className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
                    {match.home_team?.short_name} actions
                  </div>
                  <Heatmap
                    points={visibleEvents.filter((e) => e.team_id === match.home_team_id).map((e) => ({ x: e.x, y: e.y }))}
                    color={match.home_team?.color}
                    className="h-[calc(100%-1.5rem)] w-full"
                  />
                </div>
                <div className="panel-elevated p-3">
                  <div className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
                    {match.away_team?.short_name} actions
                  </div>
                  <Heatmap
                    points={visibleEvents.filter((e) => e.team_id === match.away_team_id).map((e) => ({ x: e.x, y: e.y }))}
                    color={match.away_team?.color}
                    className="h-[calc(100%-1.5rem)] w-full"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="passes" className="mt-4 min-h-0 flex-1">
              <div className="panel-elevated h-full p-3">
                <div className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
                  {match.home_team?.short_name} pass network ({homeEvents.filter((e) => e.event_type === "pass").length} passes)
                </div>
                <PassNetwork
                  edges={homeNet.edges}
                  nodes={homeNet.nodes}
                  color={match.home_team?.color}
                  className="h-[calc(100%-1.5rem)] w-full"
                />
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right rail: timeline + insights */}
        <aside className="flex min-h-0 flex-col border-l border-border bg-surface">
          <Tabs defaultValue="timeline" className="flex min-h-0 flex-1 flex-col">
            <TabsList className="mx-4 mt-4">
              <TabsTrigger value="timeline" className="flex-1">Timeline</TabsTrigger>
              <TabsTrigger value="insights" className="flex-1">Insights ({insightsQ.data?.length ?? 0})</TabsTrigger>
            </TabsList>
            <TabsContent value="timeline" className="mt-3 min-h-0 flex-1 overflow-y-auto px-4 pb-4">
              {visibleEvents.length === 0 && (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  No events tagged yet. Click on the pitch to start.
                </div>
              )}
              {[...visibleEvents].reverse().map((e) => (
                <TimelineRow key={e.id} e={e} match={match} />
              ))}
            </TabsContent>
            <TabsContent value="insights" className="mt-3 min-h-0 flex-1 overflow-y-auto px-4 pb-4">
              {(!insightsQ.data || insightsQ.data.length === 0) && (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  No AI insights yet. Tag at least 5 events then click <b>AI insights</b>.
                </div>
              )}
              {insightsQ.data?.map((i) => (
                <div key={i.id} className="mb-3 rounded-md border border-border bg-background/50 p-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] uppercase">{i.kind}</Badge>
                    {i.severity !== "info" && (
                      <Badge variant="outline" className={`text-[10px] uppercase ${i.severity === "critical" ? "text-destructive" : "text-warning"}`}>
                        {i.severity}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-2 text-sm font-semibold">{i.title}</div>
                  <p className="mt-1 text-xs text-muted-foreground">{i.body}</p>
                </div>
              ))}
            </TabsContent>
          </Tabs>
        </aside>
      </div>
    </div>
  );
}

function TeamPill({ team, reverse }: { team: Team | null; reverse?: boolean }) {
  if (!team) return null;
  return (
    <div className={`flex items-center gap-2 ${reverse ? "flex-row-reverse" : ""}`}>
      <div className="size-3 rounded-sm" style={{ backgroundColor: team.color }} />
      <span className="text-sm font-semibold">{team.short_name || team.name}</span>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="px-6 py-3 even:border-l odd:border-l border-border [&:first-child]:border-l-0">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-base font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function EventMarker({ e, match }: { e: Event; match: Match }) {
  if (e.x == null || e.y == null) return null;
  const isHome = e.team_id === match.home_team_id;
  const color = isHome ? match.home_team?.color : match.away_team?.color;
  const isShot = e.event_type === "shot";
  const isGoal = e.outcome === "goal";

  if (e.end_x != null && e.end_y != null) {
    return (
      <g>
        <line x1={e.x} y1={yToSvg(e.y)} x2={e.end_x} y2={yToSvg(e.end_y)}
          stroke={color} strokeWidth="0.3" opacity="0.5" />
        <circle cx={e.x} cy={yToSvg(e.y)} r="0.7" fill={color} />
        <circle cx={e.end_x} cy={yToSvg(e.end_y)} r="0.5" fill={color} opacity="0.6" />
      </g>
    );
  }
  return (
    <circle cx={e.x} cy={yToSvg(e.y)}
      r={isGoal ? 1.4 : isShot ? 1 : 0.7}
      fill={isGoal ? "var(--color-warning)" : color}
      stroke={isGoal ? "white" : "none"} strokeWidth="0.3"
    />
  );
}

function TimelineRow({ e, match }: { e: Event; match: Match }) {
  const isHome = e.team_id === match.home_team_id;
  const color = isHome ? match.home_team?.color : match.away_team?.color;
  return (
    <div className="mb-2 flex gap-3 rounded-md border border-border bg-background/40 p-2 text-xs">
      <div className="font-mono text-muted-foreground tabular-nums">
        {e.minute}:{String(e.second).padStart(2, "0")}
      </div>
      <div className="size-1.5 mt-1 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <div className="min-w-0 flex-1">
        <div className="font-medium capitalize">
          {e.event_type}
          {e.outcome && <span className="text-muted-foreground"> · {e.outcome}</span>}
          {e.xg != null && e.xg > 0 && <span className="ml-2 font-mono text-warning">xG {e.xg.toFixed(2)}</span>}
        </div>
        {e.tags.length > 1 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {e.tags.filter((t) => t !== e.event_type).slice(0, 4).map((t) => (
              <span key={t} className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted-foreground">{t}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function computeStats(events: Event[], match: Match) {
  const home = events.filter((e) => e.team_id === match.home_team_id);
  const away = events.filter((e) => e.team_id === match.away_team_id);
  const passHome = home.filter((e) => e.event_type === "pass").length;
  const passAway = away.filter((e) => e.event_type === "pass").length;
  const totalPass = passHome + passAway || 1;
  const shotsHome = home.filter((e) => e.event_type === "shot").length;
  const shotsAway = away.filter((e) => e.event_type === "shot").length;
  const xgHome = home.reduce((s, e) => s + (e.xg ?? 0), 0);
  const xgAway = away.reduce((s, e) => s + (e.xg ?? 0), 0);
  const defActionsHome = home.filter((e) => ["tackle","interception","foul"].includes(e.event_type)).length;
  const ppda = defActionsHome > 0 ? passAway / defActionsHome : 0;
  return {
    posHome: Math.round((passHome / totalPass) * 100),
    posAway: Math.round((passAway / totalPass) * 100),
    xgHome, xgAway, shotsHome, shotsAway, passHome, passAway, ppda,
  };
}

function buildPassNetwork(events: Event[]) {
  const passes = events.filter((e) => e.event_type === "pass" && e.x != null && e.end_x != null);
  // Bin start positions to ~10x10 cells
  const bin = (x: number, y: number) => `${Math.round(x / 12)}-${Math.round(y / 12)}`;
  const nodeMap = new Map<string, { x: number; y: number; count: number }>();
  const edgeMap = new Map<string, { fromX: number; fromY: number; toX: number; toY: number; count: number }>();
  for (const p of passes) {
    const fk = bin(p.x!, p.y!);
    const tk = bin(p.end_x!, p.end_y!);
    const fn = nodeMap.get(fk) ?? { x: p.x!, y: p.y!, count: 0 };
    fn.count++; nodeMap.set(fk, fn);
    const tn = nodeMap.get(tk) ?? { x: p.end_x!, y: p.end_y!, count: 0 };
    tn.count++; nodeMap.set(tk, tn);
    const ek = `${fk}>${tk}`;
    const e = edgeMap.get(ek) ?? { fromX: p.x!, fromY: p.y!, toX: p.end_x!, toY: p.end_y!, count: 0 };
    e.count++; edgeMap.set(ek, e);
  }
  return { nodes: Array.from(nodeMap.values()), edges: Array.from(edgeMap.values()) };
}
