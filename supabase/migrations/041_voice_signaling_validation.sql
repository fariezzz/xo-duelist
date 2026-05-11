-- Server-side guard for WebRTC voice signaling.
-- Player 1 is the only valid offerer; player 2 is the only valid answerer.

CREATE OR REPLACE FUNCTION public.validate_voice_signal(
  input_room_id uuid,
  input_from uuid,
  input_to uuid,
  input_signal text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  room_record game_rooms%rowtype;
  caller_id uuid;
BEGIN
  caller_id := auth.uid();

  IF caller_id IS NULL THEN
    RETURN false;
  END IF;

  IF input_room_id IS NULL OR input_from IS NULL OR input_to IS NULL OR input_from = input_to THEN
    RETURN false;
  END IF;

  SELECT *
  INTO room_record
  FROM public.game_rooms
  WHERE id = input_room_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF room_record.status NOT IN ('waiting', 'ongoing') OR room_record.player1_id IS NULL OR room_record.player2_id IS NULL THEN
    RETURN false;
  END IF;

  IF caller_id <> input_from THEN
    RETURN false;
  END IF;

  IF NOT (
    (input_from = room_record.player1_id AND input_to = room_record.player2_id) OR
    (input_from = room_record.player2_id AND input_to = room_record.player1_id)
  ) THEN
    RETURN false;
  END IF;

  IF input_signal = 'offer' THEN
    RETURN input_from = room_record.player1_id AND input_to = room_record.player2_id;
  ELSIF input_signal = 'answer' THEN
    RETURN input_from = room_record.player2_id AND input_to = room_record.player1_id;
  ELSIF input_signal = 'ice-candidate' THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_voice_signal(uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_voice_signal(uuid, uuid, uuid, text) TO authenticated;
