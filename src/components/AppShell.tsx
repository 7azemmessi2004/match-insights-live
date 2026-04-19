import { Link, useRouter } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, ListVideo, LogOut, Activity } from "lucide-react";

export function AppShell({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const router = useRouter();

  const onLogout = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth" });
  };

  const role = auth.roles[0] ?? "—";

  return (
    <div className="flex min-h-screen bg-background scan-line">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-surface">
        <div className="flex items-center gap-2.5 px-5 pt-6 pb-8">
          <div className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary glow-primary">
            <Activity className="size-4" />
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight">TACTICUS</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Match Intelligence
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          <NavItem to="/" icon={<LayoutDashboard className="size-4" />} label="Matches" />
          <NavItem to="/library" icon={<ListVideo className="size-4" />} label="Library" />
        </nav>

        <div className="border-t border-border px-4 py-4">
          <div className="mb-3 flex items-center gap-2.5">
            <div className="grid size-8 place-items-center rounded-full bg-surface-2 text-xs font-semibold uppercase">
              {(auth.user?.email?.[0] ?? "?").toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">{auth.user?.email ?? "—"}</div>
              <div className="text-[10px] uppercase tracking-widest text-primary">{role}</div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onLogout}
            className="w-full justify-start text-muted-foreground hover:text-foreground"
          >
            <LogOut className="mr-2 size-3.5" /> Sign out
          </Button>
        </div>
      </aside>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}

function NavItem({
  to,
  icon,
  label,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      to={to}
      activeOptions={{ exact: to === "/" }}
      className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
      activeProps={{
        className:
          "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm bg-primary/10 text-primary font-medium",
      }}
    >
      {icon}
      {label}
    </Link>
  );
}
