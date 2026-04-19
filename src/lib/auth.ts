import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";

export type AppRole = "analyst" | "coach" | "scout";

export interface AuthState {
  session: Session | null;
  user: User | null;
  roles: AppRole[];
  loading: boolean;
}

const listeners = new Set<(s: AuthState) => void>();
let state: AuthState = { session: null, user: null, roles: [], loading: true };

function emit() {
  for (const fn of listeners) fn(state);
}

async function loadRoles(userId: string): Promise<AppRole[]> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r) => r.role as AppRole);
}

let initialized = false;
function init() {
  if (initialized) return;
  initialized = true;

  // Listener first
  supabase.auth.onAuthStateChange(async (_event, session) => {
    state = { ...state, session, user: session?.user ?? null };
    if (session?.user) {
      // defer to avoid deadlock per docs
      setTimeout(async () => {
        const roles = await loadRoles(session.user.id);
        state = { ...state, roles, loading: false };
        emit();
      }, 0);
    } else {
      state = { ...state, roles: [], loading: false };
      emit();
    }
    emit();
  });

  // Then current session
  supabase.auth.getSession().then(async ({ data: { session } }) => {
    state = { ...state, session, user: session?.user ?? null };
    if (session?.user) {
      const roles = await loadRoles(session.user.id);
      state = { ...state, roles, loading: false };
    } else {
      state = { ...state, loading: false };
    }
    emit();
  });
}

export function useAuth(): AuthState {
  const [, setVersion] = useState(0);
  useEffect(() => {
    init();
    const fn = () => setVersion((v) => v + 1);
    listeners.add(fn);
    fn();
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return state;
}

export function hasRole(roles: AppRole[], r: AppRole) {
  return roles.includes(r);
}
export function canWrite(roles: AppRole[]) {
  return roles.includes("analyst") || roles.includes("coach");
}
