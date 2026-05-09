-- Friends table (idempotent): social graph edges
CREATE TABLE IF NOT EXISTS public.friends (
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  friend_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT friends_pkey PRIMARY KEY (user_id, friend_id),
  CONSTRAINT friends_no_self CHECK (user_id <> friend_id)
);

CREATE INDEX IF NOT EXISTS friends_friend_id_idx ON public.friends (friend_id);

ALTER TABLE public.friends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "friends_select_participants" ON public.friends;
CREATE POLICY "friends_select_participants"
  ON public.friends
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

DROP POLICY IF EXISTS "friends_delete_participants" ON public.friends;
CREATE POLICY "friends_delete_participants"
  ON public.friends
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- last_seen on profiles (already added in 030; ensure default)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen timestamptz;

ALTER TABLE public.profiles
  ALTER COLUMN last_seen SET DEFAULT now();

-- Public match list for profile pages (bypasses match_history RLS safely per target user)
CREATE OR REPLACE FUNCTION public.get_public_profile_matches(
  p_profile_id uuid,
  p_limit integer DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  room_id uuid,
  player1_id uuid,
  player2_id uuid,
  winner_id uuid,
  loser_id uuid,
  played_at timestamptz,
  match_type text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    mh.id,
    mh.room_id,
    mh.player1_id,
    mh.player2_id,
    mh.winner_id,
    mh.loser_id,
    mh.played_at,
    mh.match_type::text
  FROM public.match_history mh
  WHERE mh.player1_id = p_profile_id
     OR mh.player2_id = p_profile_id
  ORDER BY mh.played_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);
$$;

REVOKE ALL ON FUNCTION public.get_public_profile_matches(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_profile_matches(uuid, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_profile_matches(uuid, integer) TO authenticated;
