import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/library")({
  component: () => (
    <div className="mx-auto max-w-7xl px-8 py-10">
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Workspace</div>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">Library</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Multi-match analytics and team comparison tools — coming soon.
      </p>
      <div className="panel mt-8 p-12 text-center text-sm text-muted-foreground">
        Season-level dashboards, opponent scouting, and tactical fingerprint comparisons will live here.
      </div>
    </div>
  ),
});
