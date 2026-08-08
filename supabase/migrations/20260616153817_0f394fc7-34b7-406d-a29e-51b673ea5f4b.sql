
DROP POLICY IF EXISTS "Comments are viewable by everyone" ON public.comments;
DROP POLICY IF EXISTS "Anyone can view comments" ON public.comments;
CREATE POLICY "Authenticated users can view comments" ON public.comments
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Followers are viewable by everyone" ON public.followers;
DROP POLICY IF EXISTS "Anyone can view followers" ON public.followers;
CREATE POLICY "Authenticated users can view followers" ON public.followers
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Post likes are viewable by everyone" ON public.post_likes;
DROP POLICY IF EXISTS "Anyone can view post likes" ON public.post_likes;
CREATE POLICY "Authenticated users can view post likes" ON public.post_likes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Posts are viewable by everyone" ON public.posts;
DROP POLICY IF EXISTS "Anyone can view posts" ON public.posts;
CREATE POLICY "Authenticated users can view posts" ON public.posts
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Stories are viewable by everyone" ON public.stories;
DROP POLICY IF EXISTS "Anyone can view stories" ON public.stories;
CREATE POLICY "Authenticated users can view stories" ON public.stories
  FOR SELECT TO authenticated USING (expires_at > now());

DROP POLICY IF EXISTS "Users can update own posts" ON public.posts;
CREATE POLICY "Users can update own posts" ON public.posts
  FOR UPDATE TO authenticated
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_content_length;
ALTER TABLE public.posts ADD CONSTRAINT posts_content_length CHECK (char_length(content) <= 5000);

ALTER TABLE public.comments DROP CONSTRAINT IF EXISTS comments_content_length;
ALTER TABLE public.comments ADD CONSTRAINT comments_content_length CHECK (char_length(content) <= 1000);

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_content_length;
ALTER TABLE public.messages ADD CONSTRAINT messages_content_length CHECK (char_length(content) <= 2000);

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_bio_length;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_bio_length CHECK (bio IS NULL OR char_length(bio) <= 500);

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_display_name_length;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_display_name_length CHECK (display_name IS NULL OR char_length(display_name) <= 100);

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_post_comments_count() FROM PUBLIC, anon, authenticated;
