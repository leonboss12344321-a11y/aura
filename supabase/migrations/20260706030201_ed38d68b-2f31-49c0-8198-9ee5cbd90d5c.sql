
-- 1. Allow senders to delete their own messages
CREATE POLICY "Senders can delete their messages"
  ON public.messages FOR DELETE
  USING (sender_id = auth.uid());

-- 2. Cascade deletes so removing a conversation cleans children
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_conversation_id_fkey,
  ADD CONSTRAINT messages_conversation_id_fkey
    FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;

ALTER TABLE public.conversation_participants
  DROP CONSTRAINT IF EXISTS conversation_participants_conversation_id_fkey,
  ADD CONSTRAINT conversation_participants_conversation_id_fkey
    FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;

-- 3. RPC: delete a whole conversation, if the caller is a participant
CREATE OR REPLACE FUNCTION public.delete_conversation(_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_conversation_participant(_conversation_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not a participant';
  END IF;
  DELETE FROM public.conversations WHERE id = _conversation_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_conversation(uuid) TO authenticated;

-- 4. Account change request queue
CREATE TABLE public.account_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_type text NOT NULL CHECK (request_type IN ('username','password')),
  new_username text,
  new_password text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied')),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.account_change_requests TO authenticated;
GRANT ALL ON public.account_change_requests TO service_role;

ALTER TABLE public.account_change_requests ENABLE ROW LEVEL SECURITY;

-- Users can see their own request status (but not sensitive new_password field via app; edge fn is authoritative)
CREATE POLICY "Users see own requests"
  ON public.account_change_requests FOR SELECT
  USING (auth.uid() = user_id OR public.is_staff(auth.uid()));

-- Users insert their own request rows (edge fn will overwrite securely, this allows client-side status check flow)
CREATE POLICY "Users create own requests"
  ON public.account_change_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Staff can update (approve/deny) via UI; actual password apply happens in edge function w/ service role
CREATE POLICY "Staff can update requests"
  ON public.account_change_requests FOR UPDATE
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- Enable realtime for owner console updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.account_change_requests;
