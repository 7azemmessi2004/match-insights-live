
-- Roles
CREATE TYPE public.app_role AS ENUM ('analyst', 'coach', 'scout');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.can_write(_user_id uuid)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('analyst','coach'))
$$;

CREATE POLICY "Users see own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles readable by authed" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Auto profile + default role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name) VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'analyst');
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- Teams
CREATE TABLE public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#22d3ee',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Teams readable" ON public.teams FOR SELECT TO authenticated USING (true);
CREATE POLICY "Writers create teams" ON public.teams FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid()));
CREATE POLICY "Writers update teams" ON public.teams FOR UPDATE TO authenticated USING (public.can_write(auth.uid()));
CREATE POLICY "Writers delete teams" ON public.teams FOR DELETE TO authenticated USING (public.can_write(auth.uid()));
CREATE TRIGGER teams_touch BEFORE UPDATE ON public.teams FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Players
CREATE TABLE public.players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  jersey_number INT,
  position TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Players readable" ON public.players FOR SELECT TO authenticated USING (true);
CREATE POLICY "Writers manage players ins" ON public.players FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid()));
CREATE POLICY "Writers manage players upd" ON public.players FOR UPDATE TO authenticated USING (public.can_write(auth.uid()));
CREATE POLICY "Writers manage players del" ON public.players FOR DELETE TO authenticated USING (public.can_write(auth.uid()));
CREATE INDEX idx_players_team ON public.players(team_id);

-- Matches
CREATE TABLE public.matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  home_team_id UUID REFERENCES public.teams(id) NOT NULL,
  away_team_id UUID REFERENCES public.teams(id) NOT NULL,
  kickoff TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'scheduled', -- scheduled, live, completed
  home_score INT NOT NULL DEFAULT 0,
  away_score INT NOT NULL DEFAULT 0,
  competition TEXT,
  venue TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Matches readable" ON public.matches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Writers create matches" ON public.matches FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid()));
CREATE POLICY "Writers update matches" ON public.matches FOR UPDATE TO authenticated USING (public.can_write(auth.uid()));
CREATE POLICY "Writers delete matches" ON public.matches FOR DELETE TO authenticated USING (public.can_write(auth.uid()));
CREATE TRIGGER matches_touch BEFORE UPDATE ON public.matches FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Events
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID REFERENCES public.matches(id) ON DELETE CASCADE NOT NULL,
  team_id UUID REFERENCES public.teams(id),
  player_id UUID REFERENCES public.players(id),
  event_type TEXT NOT NULL, -- pass, shot, tackle, foul, dribble, interception, cross, save, etc
  outcome TEXT, -- success, fail, goal, miss, blocked
  minute INT NOT NULL DEFAULT 0,
  second INT NOT NULL DEFAULT 0,
  x NUMERIC(5,2), -- 0-100 pitch coordinates
  y NUMERIC(5,2),
  end_x NUMERIC(5,2),
  end_y NUMERIC(5,2),
  tags TEXT[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  xg NUMERIC(4,3),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Events readable" ON public.events FOR SELECT TO authenticated USING (true);
CREATE POLICY "Writers create events" ON public.events FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid()));
CREATE POLICY "Writers update events" ON public.events FOR UPDATE TO authenticated USING (public.can_write(auth.uid()));
CREATE POLICY "Writers delete events" ON public.events FOR DELETE TO authenticated USING (public.can_write(auth.uid()));
CREATE INDEX idx_events_match ON public.events(match_id);
CREATE INDEX idx_events_match_time ON public.events(match_id, minute, second);
CREATE INDEX idx_events_player ON public.events(player_id);
CREATE INDEX idx_events_tags ON public.events USING GIN(tags);

-- Insights (AI generated)
CREATE TABLE public.insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID REFERENCES public.matches(id) ON DELETE CASCADE NOT NULL,
  kind TEXT NOT NULL, -- summary, alert, tactical, anomaly
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info', -- info, warning, critical
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Insights readable" ON public.insights FOR SELECT TO authenticated USING (true);
CREATE POLICY "Writers create insights" ON public.insights FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid()));
CREATE POLICY "Writers delete insights" ON public.insights FOR DELETE TO authenticated USING (public.can_write(auth.uid()));
CREATE INDEX idx_insights_match ON public.insights(match_id);
