-- Fix false positives for player_is_busy on friend match invites.
-- Stale matchmaking rows and abandoned "waiting" lobbies were often treated as busy.

-- Must DROP first because CREATE OR REPLACE cannot change a function's return type.
DROP FUNCTION IF EXISTS public.send_game_invite(uuid);
DROP FUNCTION IF EXISTS public._private_invite_player_busy(uuid);

CREATE OR REPLACE FUNCTION public._private_invite_player_busy(p_uid uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lobby_fresh interval := interval '4 minutes';
  queue_fresh interval := interval '15 minutes';
BEGIN
  IF p_uid IS NULL THEN
    RETURN false;
  END IF;

  -- Active match only (not finished / cancelled lobby states)
  IF EXISTS (
    SELECT 1
    FROM public.game_rooms gr
    WHERE gr.status = 'ongoing'
      AND (gr.player1_id = p_uid OR gr.player2_id = p_uid)
  ) THEN
    RETURN true;
  END IF;

  -- Matchmaking: only count fresh queue rows
  IF EXISTS (
    SELECT 1
    FROM public.matchmaking_queue mq
    WHERE mq.player_id = p_uid
      AND mq.joined_at > (now() - queue_fresh)
  ) THEN
    RETURN true;
  END IF;

  -- Waiting lobby: only if the player still shows recent activity (heartbeat or room activity)
  IF EXISTS (
    SELECT 1
    FROM public.game_rooms gr
    WHERE gr.status = 'waiting'
      AND (
        (
          gr.player1_id = p_uid
          AND COALESCE(gr.player1_last_heartbeat, gr.last_move_at, gr.created_at) > (now() - lobby_fresh)
        )
        OR (
          gr.player2_id = p_uid
          AND COALESCE(gr.player2_last_heartbeat, gr.last_move_at, gr.created_at) > (now() - lobby_fresh)
        )
      )
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

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
      AND gi.sender_id = sid
      AND gi.receiver_id = input_receiver_id
  ) THEN
    RAISE EXCEPTION 'invite_already_pending';
  END IF;

  IF public._private_invite_player_busy(sid) THEN
    RAISE EXCEPTION 'player_is_busy';
  END IF;

  IF public._private_invite_player_busy(input_receiver_id) THEN
    RAISE EXCEPTION 'player_is_busy';
  END IF;

  INSERT INTO public.game_invites (sender_id, receiver_id, status)
  VALUES (sid, input_receiver_id, 'pending')
  RETURNING id INTO new_invite_id;

  RETURN new_invite_id;
END;
$$;

REVOKE ALL ON FUNCTION public._private_invite_player_busy(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.send_game_invite(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_game_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_game_invite(uuid) TO service_role;
