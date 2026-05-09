-- Fix respond_game_invite: replace aggressive inline busy checks with the
-- improved _private_invite_player_busy helper that ignores stale/abandoned
-- lobbies and matchmaking rows (same logic send_game_invite already uses).

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
  IF my_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT *
  INTO inv
  FROM public.game_invites
  WHERE id = input_invite_id
    AND receiver_id = my_id
    AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite_not_found';
  END IF;

  IF NOT input_accept THEN
    UPDATE public.game_invites
    SET status = 'declined',
        responded_at = now()
    WHERE id = input_invite_id;

    RETURN NULL;
  END IF;

  -- Use the shared helper that filters out stale lobbies & matchmaking rows
  IF public._private_invite_player_busy(my_id) THEN
    RAISE EXCEPTION 'player_is_busy';
  END IF;

  IF public._private_invite_player_busy(inv.sender_id) THEN
    RAISE EXCEPTION 'player_is_busy';
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
