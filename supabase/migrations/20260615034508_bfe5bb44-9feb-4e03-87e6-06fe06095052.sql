
DROP POLICY IF EXISTS "Conversations visible to participants" ON public.conversations;
CREATE POLICY "Conversations visible to participants or creator" ON public.conversations
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR id IN (SELECT cp.conversation_id FROM public.conversation_participants cp WHERE cp.user_id = auth.uid())
  );
