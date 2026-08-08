
-- =====================================================================================
-- 1) account_change_requests: stop leaking password change payloads
-- =====================================================================================
-- Remove from realtime so requests aren't pushed to any subscriber.
ALTER PUBLICATION supabase_realtime DROP TABLE public.account_change_requests;

-- Ciphertext column: only the server (service_role) needs it. Hide from users AND staff.
REVOKE SELECT (new_password_ciphertext) ON public.account_change_requests FROM PUBLIC, anon, authenticated;
-- service_role retains full access via existing table-level GRANT ALL.

-- =====================================================================================
-- 2) profiles: column-level lockdown of sensitive fields
-- =====================================================================================
REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (
  id, username, display_name, avatar_url, banner_url, bio, is_online,
  verified_until, public_key, ads_enabled, adult_content, dob_visibility,
  accepted_terms_at, created_at, updated_at
) ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO service_role;

-- Self full-row access through a security-definer helper.
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS SETOF public.profiles
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM public.profiles WHERE id = auth.uid()
$$;
REVOKE EXECUTE ON FUNCTION public.get_my_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;

-- Staff moderation view over profiles including hidden fields.
CREATE OR REPLACE FUNCTION public.staff_list_profiles(_search text DEFAULT NULL, _lim int DEFAULT 500)
RETURNS SETOF public.profiles
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
    SELECT * FROM public.profiles
    WHERE _search IS NULL
       OR username ILIKE '%'||_search||'%'
       OR display_name ILIKE '%'||_search||'%'
    ORDER BY created_at DESC
    LIMIT COALESCE(_lim, 500);
END $$;
REVOKE EXECUTE ON FUNCTION public.staff_list_profiles(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_list_profiles(text, int) TO authenticated;

-- Public age helper: exposes an age integer only when the profile owner opted in.
CREATE OR REPLACE FUNCTION public.profile_age(_user_id uuid)
RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN p.date_of_birth IS NULL THEN NULL
    WHEN _user_id = auth.uid() OR p.dob_visibility IN ('age_only','public') OR public.is_staff(auth.uid())
      THEN EXTRACT(YEAR FROM age(p.date_of_birth))::int
    ELSE NULL
  END
  FROM public.profiles p WHERE p.id = _user_id
$$;
REVOKE EXECUTE ON FUNCTION public.profile_age(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profile_age(uuid) TO authenticated;

-- =====================================================================================
-- 3) storage.objects "Authenticated read stories": replace fragile LIKE with exact match
-- =====================================================================================
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS image_path text;

-- Backfill image_path from any existing signed/public URLs in stories.image_url.
UPDATE public.stories
   SET image_path = substring(image_url from '/object/(?:sign|public)/stories/([^?]+)')
 WHERE image_path IS NULL
   AND image_url ~ '/object/(?:sign|public)/stories/';

DROP POLICY IF EXISTS "Authenticated read stories" ON storage.objects;
CREATE POLICY "Authenticated read stories"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'stories'
    AND (
      public.is_staff(auth.uid())
      OR (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.stories s
        WHERE s.image_path = objects.name
          AND s.expires_at > now()
          AND NOT public.is_shadow_banned(s.user_id)
      )
    )
  );
