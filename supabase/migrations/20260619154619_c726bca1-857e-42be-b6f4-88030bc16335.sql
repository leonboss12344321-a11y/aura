
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND is_shadow_banned IS NOT DISTINCT FROM (SELECT p.is_shadow_banned FROM public.profiles p WHERE p.id = auth.uid())
  AND is_suspended      IS NOT DISTINCT FROM (SELECT p.is_suspended      FROM public.profiles p WHERE p.id = auth.uid())
  AND suspended_until   IS NOT DISTINCT FROM (SELECT p.suspended_until   FROM public.profiles p WHERE p.id = auth.uid())
  AND is_deleted        IS NOT DISTINCT FROM (SELECT p.is_deleted        FROM public.profiles p WHERE p.id = auth.uid())
);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can follow" ON public.followers;
CREATE POLICY "Users can follow"
ON public.followers FOR INSERT TO authenticated
WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "Users can unfollow" ON public.followers;
CREATE POLICY "Users can unfollow"
ON public.followers FOR DELETE TO authenticated
USING (auth.uid() = follower_id);

DROP POLICY IF EXISTS "Anyone can see followers" ON public.followers;

DROP POLICY IF EXISTS "Users can like" ON public.post_likes;
CREATE POLICY "Users can like"
ON public.post_likes FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can unlike" ON public.post_likes;
CREATE POLICY "Users can unlike"
ON public.post_likes FOR DELETE TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Anyone can see likes" ON public.post_likes;

DROP POLICY IF EXISTS "Users can create stories" ON public.stories;
CREATE POLICY "Users can create stories"
ON public.stories FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own stories" ON public.stories;
CREATE POLICY "Users can delete own stories"
ON public.stories FOR DELETE TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can see their signals" ON public.webrtc_signals;
CREATE POLICY "Users can see their signals"
ON public.webrtc_signals FOR SELECT TO authenticated
USING (auth.uid() = receiver_id OR auth.uid() = sender_id);

DROP POLICY IF EXISTS "Users can send signals" ON public.webrtc_signals;
CREATE POLICY "Users can send signals"
ON public.webrtc_signals FOR INSERT TO authenticated
WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "Users can delete their signals" ON public.webrtc_signals;
CREATE POLICY "Users can delete their signals"
ON public.webrtc_signals FOR DELETE TO authenticated
USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

DROP POLICY IF EXISTS "Public read avatars" ON storage.objects;
CREATE POLICY "Authenticated read avatars"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Public read post-images" ON storage.objects;
CREATE POLICY "Authenticated read post-images"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'post-images');

DROP POLICY IF EXISTS "Public read stories" ON storage.objects;
CREATE POLICY "Authenticated read stories"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'stories'
  AND (
    public.is_staff(auth.uid())
    OR (storage.foldername(name))[1] = (auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.stories s
      WHERE s.image_url LIKE '%' || storage.objects.name
        AND s.expires_at > now()
        AND NOT public.is_shadow_banned(s.user_id)
    )
  )
);
