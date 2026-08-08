
-- Security definer helpers to avoid recursive RLS
CREATE OR REPLACE FUNCTION public.is_conversation_participant(_conversation_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = _conversation_id AND user_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_conversation_creator(_conversation_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversations
    WHERE id = _conversation_id AND created_by = _user_id
  )
$$;

REVOKE EXECUTE ON FUNCTION public.is_conversation_participant(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_conversation_creator(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_conversation_creator(uuid, uuid) TO authenticated, service_role;

-- conversation_participants
DROP POLICY IF EXISTS "Users can see co-participants" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can see their conversation links" ON public.conversation_participants;
DROP POLICY IF EXISTS "Conversation creator adds participants" ON public.conversation_participants;

CREATE POLICY "Participants visible to members or creator"
ON public.conversation_participants
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_conversation_creator(conversation_id, auth.uid())
  OR public.is_conversation_participant(conversation_id, auth.uid())
);

CREATE POLICY "Creator can add participants"
ON public.conversation_participants
FOR INSERT TO authenticated
WITH CHECK (public.is_conversation_creator(conversation_id, auth.uid()));

-- conversations
DROP POLICY IF EXISTS "Conversations visible to participants or creator" ON public.conversations;
CREATE POLICY "Conversations visible to participants or creator"
ON public.conversations
FOR SELECT TO authenticated
USING (
  created_by = auth.uid()
  OR public.is_conversation_participant(id, auth.uid())
);

-- messages
DROP POLICY IF EXISTS "Users can see messages in their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can send messages" ON public.messages;

CREATE POLICY "Users can see messages in their conversations"
ON public.messages
FOR SELECT TO authenticated
USING (public.is_conversation_participant(conversation_id, auth.uid()));

CREATE POLICY "Users can send messages"
ON public.messages
FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND public.is_conversation_participant(conversation_id, auth.uid())
);
