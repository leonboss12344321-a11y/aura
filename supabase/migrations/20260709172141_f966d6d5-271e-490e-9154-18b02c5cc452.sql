
-- 1) Notifications: revoke user-side INSERT. All legitimate inserts happen via SECURITY DEFINER
--    triggers (notify_on_like/comment/follow, apply_verification_decision) and service-role
--    edge functions, so no user code path is affected.
DROP POLICY IF EXISTS "Users can create notifications" ON public.notifications;
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Insert notifications" ON public.notifications;
-- Catch-all: remove any remaining INSERT policy so only service_role can insert.
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
           WHERE schemaname='public' AND tablename='notifications' AND cmd='INSERT'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.notifications', p.policyname);
  END LOOP;
END $$;

-- 2) conversation_keys: close the `OR is_escrow` bypass. Caller must be a participant AND
--    the target user_id must be self, another participant, or the platform owner (for escrow).
DROP POLICY IF EXISTS "Participants insert wrapped keys" ON public.conversation_keys;
CREATE POLICY "Participants insert wrapped keys"
  ON public.conversation_keys
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_conversation_participant(conversation_id, auth.uid())
    AND (
      user_id = auth.uid()
      OR public.is_conversation_participant(conversation_id, user_id)
      OR (is_escrow AND public.has_role(user_id, 'owner'::public.app_role))
    )
  );

-- Same tightening for UPDATE, which is used via upsert.
DROP POLICY IF EXISTS "Participants update wrapped keys" ON public.conversation_keys;
CREATE POLICY "Participants update wrapped keys"
  ON public.conversation_keys
  FOR UPDATE
  TO authenticated
  USING (public.is_conversation_participant(conversation_id, auth.uid()))
  WITH CHECK (
    public.is_conversation_participant(conversation_id, auth.uid())
    AND (
      user_id = auth.uid()
      OR public.is_conversation_participant(conversation_id, user_id)
      OR (is_escrow AND public.has_role(user_id, 'owner'::public.app_role))
    )
  );

-- 3) Revoke public/anon EXECUTE on every remaining SECURITY DEFINER function in `public`.
--    Trigger functions and RLS helpers should never be invokable by unauthenticated visitors.
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT n.nspname, p.proname,
           pg_catalog.pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon',
                   f.nspname, f.proname, f.args);
  END LOOP;
END $$;

-- 4) account_change_requests.new_password: never store plaintext. Rename column so any legacy
--    reader breaks loudly, drop leftover plaintext values, and switch to encrypted ciphertext.
UPDATE public.account_change_requests SET new_password = NULL WHERE new_password IS NOT NULL;
ALTER TABLE public.account_change_requests
  RENAME COLUMN new_password TO new_password_ciphertext;
COMMENT ON COLUMN public.account_change_requests.new_password_ciphertext IS
  'AES-GCM ciphertext (base64) of the requested new password, encrypted with PW_REQUEST_ENC_KEY in edge functions. Never store plaintext here.';
