
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS dob_visibility text NOT NULL DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS banner_url text,
  ADD COLUMN IF NOT EXISTS verified_until timestamptz,
  ADD COLUMN IF NOT EXISTS ads_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS adult_content boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_dob_visibility_check CHECK (dob_visibility IN ('private','age_only','public'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public';

DO $$ BEGIN
  ALTER TABLE public.posts
    ADD CONSTRAINT posts_visibility_check CHECK (visibility IN ('public','followers','private'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP POLICY IF EXISTS "Posts viewable by authenticated" ON public.posts;
DROP POLICY IF EXISTS "posts_select" ON public.posts;
DROP POLICY IF EXISTS "posts_select_visibility" ON public.posts;
CREATE POLICY "posts_select_visibility" ON public.posts
FOR SELECT TO authenticated
USING (
  is_staff(auth.uid())
  OR author_id = auth.uid()
  OR (
    (NOT is_shadow_banned(author_id))
    AND (
      visibility = 'public'
      OR (visibility = 'followers' AND EXISTS (
        SELECT 1 FROM public.followers f
        WHERE f.following_id = posts.author_id AND f.follower_id = auth.uid()
      ))
    )
  )
);

CREATE TABLE IF NOT EXISTS public.verification_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  decided_by uuid REFERENCES auth.users(id),
  decided_at timestamptz,
  expires_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT verification_status_check CHECK (status IN ('pending','approved','denied')),
  CONSTRAINT verification_reason_len CHECK (char_length(reason) BETWEEN 10 AND 1000)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.verification_requests TO authenticated;
GRANT ALL ON public.verification_requests TO service_role;
ALTER TABLE public.verification_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_view_own_verification" ON public.verification_requests;
CREATE POLICY "user_view_own_verification" ON public.verification_requests
FOR SELECT TO authenticated USING (auth.uid() = user_id OR is_staff(auth.uid()));
DROP POLICY IF EXISTS "user_insert_verification" ON public.verification_requests;
CREATE POLICY "user_insert_verification" ON public.verification_requests
FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "staff_update_verification" ON public.verification_requests;
CREATE POLICY "staff_update_verification" ON public.verification_requests
FOR UPDATE TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

DROP TRIGGER IF EXISTS trg_verification_updated_at ON public.verification_requests;
CREATE TRIGGER trg_verification_updated_at BEFORE UPDATE ON public.verification_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_verification_status ON public.verification_requests(status, created_at DESC);

CREATE OR REPLACE FUNCTION public.apply_verification_decision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    UPDATE public.profiles SET verified_until = COALESCE(NEW.expires_at, 'infinity'::timestamptz)
      WHERE id = NEW.user_id;
    INSERT INTO public.notifications(user_id, actor_id, type)
      VALUES (NEW.user_id, NEW.decided_by, 'verification_approved');
  ELSIF NEW.status = 'denied' AND (OLD.status IS DISTINCT FROM 'denied') THEN
    INSERT INTO public.notifications(user_id, actor_id, type)
      VALUES (NEW.user_id, NEW.decided_by, 'verification_denied');
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_apply_verification ON public.verification_requests;
CREATE TRIGGER trg_apply_verification AFTER UPDATE ON public.verification_requests
  FOR EACH ROW EXECUTE FUNCTION public.apply_verification_decision();

CREATE TABLE IF NOT EXISTS public.story_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  viewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(story_id, viewer_id)
);
GRANT SELECT, INSERT ON public.story_views TO authenticated;
GRANT ALL ON public.story_views TO service_role;
ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "viewer_insert_own" ON public.story_views;
CREATE POLICY "viewer_insert_own" ON public.story_views
FOR INSERT TO authenticated WITH CHECK (auth.uid() = viewer_id);
DROP POLICY IF EXISTS "story_owner_or_viewer_read" ON public.story_views;
CREATE POLICY "story_owner_or_viewer_read" ON public.story_views
FOR SELECT TO authenticated USING (
  auth.uid() = viewer_id
  OR is_staff(auth.uid())
  OR EXISTS (SELECT 1 FROM public.stories s WHERE s.id = story_views.story_id AND s.user_id = auth.uid())
);

CREATE INDEX IF NOT EXISTS idx_story_views_story ON public.story_views(story_id, viewed_at DESC);

-- Storage policies for banners bucket
DROP POLICY IF EXISTS "banners_read" ON storage.objects;
CREATE POLICY "banners_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'banners');
DROP POLICY IF EXISTS "banners_write_own" ON storage.objects;
CREATE POLICY "banners_write_own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'banners' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "banners_update_own" ON storage.objects;
CREATE POLICY "banners_update_own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'banners' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "banners_delete_own" ON storage.objects;
CREATE POLICY "banners_delete_own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'banners' AND (storage.foldername(name))[1] = auth.uid()::text);
