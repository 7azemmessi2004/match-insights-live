import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import { Plus, Circle, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { useAuth, canWrite } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/")({
  component: MatchesIndex,
});

interface MatchRow {
  id: string;
  status: string;
  kickoff: string;
  home_score: number;
  away_score: number;
  competition: string | null;
  venue: string | null;
  home_team: { id: string; name: string; short_name: string; color: string } | null;
  away_team: { id: string; name: string; short_name: string; color: string } | null;
}

function MatchesIndex() {
  const auth = useAuth();
  const allowWrite = canWrite(auth.roles);

  const matches = useQuery({
    queryKey: ["matches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("matches")
        .select(
          "id,status,kickoff,home_score,away_score,competition,venue,home_team:teams!matches_home_team_id_fkey(id,name,short_name,color),away_team:teams!matches_away_team_id_fkey(id,name,short_name,color)"
        )
        .order("kickoff", { ascending: false });
      if (error) throw error;
      return data as unknown as MatchRow[];
    },
  });

  return (
    <div className="mx-auto max-w-7xl px-8 py-10">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
            Workspace
          </div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Matches</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Open a match to tag events live, review, and run AI analysis.
          </p>
        </div>
        {allowWrite && <NewMatchDialog />}
      </div>

      <div className="mt-8 grid gap-3">
        {matches.isLoading && (
          <div className="panel p-12 text-center text-sm text-muted-foreground">Loading…</div>
        )}
        {matches.data?.length === 0 && (
          <div className="panel p-12 text-center">
            <div className="mx-auto grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
              <Plus className="size-5" />
            </div>
            <div className="mt-3 text-sm font-medium">No matches yet</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Create your first match to start tagging events.
            </p>
          </div>
        )}
        {matches.data?.map((m) => <MatchRow key={m.id} match={m} />)}
      </div>
    </div>
  );
}

function MatchRow({ match }: { match: MatchRow }) {
  const isLive = match.status === "live";
  return (
    <Link
      to="/matches/$matchId"
      params={{ matchId: match.id }}
      className="group block"
    >
      <Card className="panel-elevated flex items-center justify-between gap-6 px-5 py-4 transition-colors hover:border-border-strong">
        <div className="flex min-w-0 items-center gap-4">
          <StatusBadge status={match.status} />
          <div className="flex items-center gap-3">
            <TeamBadge team={match.home_team} />
            <div className="font-mono text-lg font-semibold tabular-nums">
              {match.home_score} <span className="text-muted-foreground">–</span>{" "}
              {match.away_score}
            </div>
            <TeamBadge team={match.away_team} reverse />
          </div>
        </div>

        <div className="flex items-center gap-6 text-xs text-muted-foreground">
          <div className="text-right">
            <div>{match.competition ?? "Friendly"}</div>
            <div className="font-mono">
              {format(new Date(match.kickoff), "dd MMM yyyy · HH:mm")}
              {isLive && <span className="ml-2 text-destructive">LIVE</span>}
            </div>
          </div>
          <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
        </div>
      </Card>
    </Link>
  );
}

function StatusBadge({ status }: { status: string }) {
  const conf = {
    live: { color: "text-destructive", label: "LIVE", pulse: true },
    completed: { color: "text-muted-foreground", label: "FT", pulse: false },
    scheduled: { color: "text-primary", label: "UPCOMING", pulse: false },
  }[status] ?? { color: "text-muted-foreground", label: status.toUpperCase(), pulse: false };
  return (
    <div className="flex items-center gap-2">
      <Circle className={`size-2 fill-current ${conf.color} ${conf.pulse ? "pulse-dot" : ""}`} />
      <span className={`text-[10px] font-bold uppercase tracking-widest ${conf.color}`}>
        {conf.label}
      </span>
    </div>
  );
}

function TeamBadge({
  team,
  reverse,
}: {
  team: MatchRow["home_team"];
  reverse?: boolean;
}) {
  if (!team) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <div className={`flex items-center gap-2 ${reverse ? "flex-row-reverse" : ""}`}>
      <div className="size-2.5 rounded-sm" style={{ backgroundColor: team.color }} />
      <span className="text-sm font-medium">{team.short_name || team.name}</span>
    </div>
  );
}

function NewMatchDialog() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [homeName, setHomeName] = useState("");
  const [awayName, setAwayName] = useState("");
  const [competition, setCompetition] = useState("");

  const teams = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data, error } = await supabase.from("teams").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      // Find or create teams
      const ensureTeam = async (name: string, fallbackColor: string) => {
        const existing = teams.data?.find((t) => t.name.toLowerCase() === name.trim().toLowerCase());
        if (existing) return existing.id;
        const { data, error } = await supabase
          .from("teams")
          .insert({ name: name.trim(), short_name: name.trim().slice(0, 3).toUpperCase(), color: fallbackColor })
          .select()
          .single();
        if (error) throw error;
        return data.id;
      };
      const home = await ensureTeam(homeName, "#22d3ee");
      const away = await ensureTeam(awayName, "#f97316");
      const { data, error } = await supabase
        .from("matches")
        .insert({
          home_team_id: home,
          away_team_id: away,
          competition: competition || null,
          status: "live",
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (m) => {
      qc.invalidateQueries({ queryKey: ["matches"] });
      setOpen(false);
      toast.success("Match created");
      navigate({ to: "/matches/$matchId", params: { matchId: m.id } });
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Failed to create match");
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-1.5 size-4" /> New match
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-surface">
        <DialogHeader>
          <DialogTitle>New match</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="space-y-2">
            <Label>Home team</Label>
            <Input value={homeName} onChange={(e) => setHomeName(e.target.value)} placeholder="Stoke City" />
          </div>
          <div className="space-y-2">
            <Label>Away team</Label>
            <Input value={awayName} onChange={(e) => setAwayName(e.target.value)} placeholder="Athletic Bilbao" />
          </div>
          <div className="space-y-2">
            <Label>Competition</Label>
            <Input value={competition} onChange={(e) => setCompetition(e.target.value)} placeholder="Pre-season" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => create.mutate()} disabled={!homeName || !awayName || create.isPending}>
            {create.isPending ? "Creating…" : "Create & start tagging"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
