-- ============================================================
-- 036: Invite lifecycle (expires_at, cancel, specific errors)
--      + Presence heartbeat-based offline detection
-- ============================================================

-- 1) Add expires_at column
ALTER TABLE public.game_invites
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- Backfill existing pending invites with 30s from creation
UPDATE public.game_invites
SET expires_at = created_at + interval '30 seconds'
WHERE expires_at IS NULL;

-- Set default for new rows
ALTER TABLE public.game_invites
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '30 seconds');

-- 2) Expand status CHECK to include 'expired'
ALTER TABLE public.game_invites DROP CONSTRAINT IF EXISTS game_invites_status_check;
ALTER TABLE public.game_invites
  ADD CONSTRAINT game_invites_status_check
  CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'expired'));

-- 3) Helper: auto-expire stale pending invites
CREATE OR REPLACE FUNCTION public.expire_stale_invites()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.game_invites
  SET status = 'expired',
      responded_at = now()
  WHERE status = 'pending'
    AND expires_at < now();
END;
$$;

REVOKE ALL ON FUNCTION public.expire_stale_invites() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_stale_invites() TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_invites() TO service_role;

-- 4) Rebuild send_game_invite with expires_at + specific error codes
DROP FUNCTION IF EXISTS public.send_game_invite(uuid);

CREATE OR REPLACE FUNCTION public.send_game_invite(input_receiver_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sid uuid := auth.uid();
  new_invite_id uuid;
BEGIN
  -- Auto-expire before checks
  PERFORM public.expire_stale_invites();

  IF sid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF input_receiver_id IS NULL OR input_receiver_id = sid THEN
    RAISE EXCEPTION 'cannot_invite_yourself';
  END IF;

  -- Drop stale queue rows so abandoned matchmaking does not block invites
  DELETE FROM public.matchmaking_queue mq
  WHERE mq.player_id IN (sid, input_receiver_id)
    AND mq.joined_at < (now() - interval '15 minutes');

  IF NOT EXISTS (
    SELECT 1
    FROM public.friends f
    WHERE (f.user_id = sid AND f.friend_id = input_receiver_id)
       OR (f.user_id = input_receiver_id AND f.friend_id = sid)
  ) THEN
    RAISE EXCEPTION 'not_friends';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.game_invites gi
    WHERE gi.status = 'pending'
      AND gi.expires_at > now()
      AND gi.sender_id = sid
      AND gi.receiver_id = input_receiver_id
  ) THEN
    RAISE EXCEPTION 'invite_already_pending';
  END IF;

  -- Specific error codes for sender vs receiver busy
  IF public._private_invite_player_busy(sid) THEN
    RAISE EXCEPTION 'sender_busy';
  END IF;

  IF public._private_invite_player_busy(input_receiver_id) THEN
    RAISE EXCEPTION 'receiver_busy';
  END IF;

  INSERT INTO public.game_invites (sender_id, receiver_id, status, expires_at)
  VALUES (sid, input_receiver_id, 'pending', now() + interval '30 seconds')
  RETURNING id INTO new_invite_id;

  RETURN new_invite_id;
END;
$$;

REVOKE ALL ON FUNCTION public.send_game_invite(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_game_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_game_invite(uuid) TO service_role;

-- 5) Rebuild respond_game_invite with expiry check + specific error codes
DROP FUNCTION IF EXISTS public.respond_game_invite(uuid, boolean);

CREATE OR REPLACE FUNCTION public.respond_game_invite(input_invite_id uuid, input_accept boolean)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  my_id uuid := auth.uid();
  inv public.game_invites%rowtype;
  new_room_id uuid;
  generated_code text;
BEGIN
  -- Auto-expire before checks
  PERFORM public.expire_stale_invites();

  IF my_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT *
  INTO inv
  FROM public.game_invites
  WHERE id = input_invite_id
    AND receiver_id = my_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite_not_found';
  END IF;

  -- Check if already resolved
  IF inv.status <> 'pending' THEN
    IF inv.status = 'expired' THEN
      RAISE EXCEPTION 'invite_expired';
    ELSIF inv.status = 'cancelled' THEN
      RAISE EXCEPTION 'invite_cancelled';
    ELSE
      RAISE EXCEPTION 'invite_already_resolved';
    END IF;
  END IF;

  -- Check if invite has expired by time even if status hasn't been updated
  IF inv.expires_at IS NOT NULL AND inv.expires_at < now() THEN
    UPDATE public.game_invites
    SET status = 'expired', responded_at = now()
    WHERE id = input_invite_id;
    RAISE EXCEPTION 'invite_expired';
  END IF;

  IF NOT input_accept THEN
    UPDATE public.game_invites
    SET status = 'declined',
        responded_at = now()
    WHERE id = input_invite_id;

    RETURN NULL;
  END IF;

  -- Specific error codes for busy
  IF public._private_invite_player_busy(my_id) THEN
    RAISE EXCEPTION 'receiver_busy';
  END IF;

  IF public._private_invite_player_busy(inv.sender_id) THEN
    RAISE EXCEPTION 'sender_busy';
  END IF;

  generated_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  INSERT INTO public.game_rooms (
    player1_id,
    player2_id,
    current_turn,
    status,
    room_code,
    player1_ready,
    player2_ready,
    is_public,
    is_vs_ai,
    ai_difficulty,
    ai_elo_mode
  )
  VALUES (
    inv.sender_id,
    my_id,
    inv.sender_id,
    'ongoing',
    generated_code,
    true,
    true,
    false,
    false,
    'adaptive',
    'reduced'
  )
  RETURNING id INTO new_room_id;

  UPDATE public.game_invites
  SET status = 'accepted',
      responded_at = now(),
      room_id = new_room_id
  WHERE id = input_invite_id;

  RETURN new_room_id;
END;
$$;

REVOKE ALL ON FUNCTION public.respond_game_invite(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_game_invite(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_game_invite(uuid, boolean) TO service_role;

-- 6) New RPC: cancel_game_invite (sender cancels their own pending invite)
CREATE OR REPLACE FUNCTION public.cancel_game_invite(input_invite_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sid uuid := auth.uid();
  inv public.game_invites%rowtype;
BEGIN
  IF sid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT *
  INTO inv
  FROM public.game_invites
  WHERE id = input_invite_id
    AND sender_id = sid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite_not_found';
  END IF;

  IF inv.status <> 'pending' THEN
    RAISE EXCEPTION 'invite_already_resolved';
  END IF;

  UPDATE public.game_invites
  SET status = 'cancelled',
      responded_at = now()
  WHERE id = input_invite_id;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_game_invite(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_game_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_game_invite(uuid) TO service_role;

-- 7) Presence: mark stale profiles as offline (last_seen > 2 minutes)
CREATE OR REPLACE FUNCTION public.cleanup_stale_presence()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET status = 'offline'
  WHERE status <> 'offline'
    AND last_seen < (now() - interval '2 minutes');
END;
$$;


REVOKE ALL ON FUNCTION public.cleanup_stale_presence() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_presence() TO service_role;
