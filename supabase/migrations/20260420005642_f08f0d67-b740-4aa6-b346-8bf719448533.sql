
-- 1. Extend matches with video metadata
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS video_url text,
  ADD COLUMN IF NOT EXISTS video_storage text NOT NULL DEFAULT 'none' CHECK (video_storage IN ('none','local','cloud')),
  ADD COLUMN IF NOT EXISTS video_duration_sec numeric;

-- 2. Bookmarks
CREATE TABLE IF NOT EXISTS public.bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  label text NOT NULL,
  start_sec numeric NOT NULL,
  end_sec numeric,
  color text DEFAULT '#22d3ee',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Bookmarks readable" ON public.bookmarks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Writers create bookmarks" ON public.bookmarks FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid()));
CREATE POLICY "Writers update bookmarks" ON public.bookmarks FOR UPDATE TO authenticated USING (public.can_write(auth.uid()));
CREATE POLICY "Writers delete bookmarks" ON public.bookmarks FOR DELETE TO authenticated USING (public.can_write(auth.uid()));

CREATE INDEX IF NOT EXISTS bookmarks_match_id_idx ON public.bookmarks(match_id);

-- 3. Annotations
CREATE TABLE IF NOT EXISTS public.annotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  timestamp_sec numeric NOT NULL,
  shape text NOT NULL CHECK (shape IN ('arrow','circle','rect','freehand','text')),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  color text DEFAULT '#facc15',
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.annotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Annotations readable" ON public.annotations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Writers create annotations" ON public.annotations FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid()));
CREATE POLICY "Writers update annotations" ON public.annotations FOR UPDATE TO authenticated USING (public.can_write(auth.uid()));
CREATE POLICY "Writers delete annotations" ON public.annotations FOR DELETE TO authenticated USING (public.can_write(auth.uid()));

CREATE INDEX IF NOT EXISTS annotations_match_id_idx ON public.annotations(match_id);

-- 4. Storage bucket for uploaded MP4s
INSERT INTO storage.buckets (id, name, public)
VALUES ('match-videos', 'match-videos', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for match-videos
CREATE POLICY "Authed read match-videos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'match-videos');

CREATE POLICY "Writers upload match-videos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'match-videos' AND public.can_write(auth.uid()));

CREATE POLICY "Writers update match-videos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'match-videos' AND public.can_write(auth.uid()));

CREATE POLICY "Writers delete match-videos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'match-videos' AND public.can_write(auth.uid()));
