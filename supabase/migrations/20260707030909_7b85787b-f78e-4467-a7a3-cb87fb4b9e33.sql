
-- STORY REACTIONS
CREATE TABLE public.story_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 16),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (story_id, user_id, emoji)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_reactions TO authenticated;
GRANT ALL ON public.story_reactions TO service_role;
ALTER TABLE public.story_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view story reactions" ON public.story_reactions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can react to stories" ON public.story_reactions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can remove own reactions or story owner/staff can" ON public.story_reactions
  FOR DELETE TO authenticated USING (
    auth.uid() = user_id
    OR public.is_staff(auth.uid())
    OR EXISTS (SELECT 1 FROM public.stories s WHERE s.id = story_id AND s.user_id = auth.uid())
  );

-- STORY COMMENTS
CREATE TABLE public.story_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_comments TO authenticated;
GRANT ALL ON public.story_comments TO service_role;
ALTER TABLE public.story_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view story comments" ON public.story_comments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can comment on stories" ON public.story_comments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Author, story owner, or staff can delete comment" ON public.story_comments
  FOR DELETE TO authenticated USING (
    auth.uid() = user_id
    OR public.is_staff(auth.uid())
    OR EXISTS (SELECT 1 FROM public.stories s WHERE s.id = story_id AND s.user_id = auth.uid())
  );

-- POST REPORTS
CREATE TABLE public.post_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('spam','nudity','harassment','violence','misinformation','hate','self_harm','other')),
  details text CHECK (details IS NULL OR char_length(details) <= 1000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  resolved_by uuid REFERENCES auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_reports TO authenticated;
GRANT ALL ON public.post_reports TO service_role;
ALTER TABLE public.post_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can submit reports" ON public.post_reports
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "Staff can view all reports" ON public.post_reports
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can update reports" ON public.post_reports
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Reporter can view own reports" ON public.post_reports
  FOR SELECT TO authenticated USING (auth.uid() = reporter_id);

CREATE INDEX idx_story_reactions_story ON public.story_reactions(story_id);
CREATE INDEX idx_story_comments_story ON public.story_comments(story_id, created_at);
CREATE INDEX idx_post_reports_status ON public.post_reports(status, created_at DESC);
