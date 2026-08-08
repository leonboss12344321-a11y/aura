
DROP POLICY IF EXISTS "Chat images upload own" ON storage.objects;
DROP POLICY IF EXISTS "Chat images read own" ON storage.objects;
DROP POLICY IF EXISTS "Chat images delete own" ON storage.objects;

CREATE POLICY "Chat images upload own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-images' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Chat images read own" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'chat-images' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Chat images delete own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'chat-images' AND (storage.foldername(name))[1] = auth.uid()::text);
