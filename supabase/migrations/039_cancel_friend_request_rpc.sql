-- RPC to cancel an outgoing friend request (sender only)
CREATE OR REPLACE FUNCTION public.cancel_friend_request(input_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_id uuid;
BEGIN
  SELECT sender_id INTO v_sender_id
  FROM friend_requests
  WHERE id = input_request_id AND status = 'pending';

  IF v_sender_id IS NULL THEN
    RAISE EXCEPTION 'request_not_found';
  END IF;

  IF v_sender_id != auth.uid() THEN
    RAISE EXCEPTION 'permission_denied: you can only cancel your own requests';
  END IF;

  DELETE FROM friend_requests WHERE id = input_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_friend_request(uuid) TO authenticated;
