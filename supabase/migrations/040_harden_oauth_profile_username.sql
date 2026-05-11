-- Harden auth.users -> profiles sync for OAuth and email/password users.
-- Prevent username collisions from breaking auth sign-up by generating a unique fallback username.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_username text;
  candidate_username text;
  avatar_url text;
  suffix integer := 0;
BEGIN
  base_username := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'username'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'user_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'preferred_username'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
    NULLIF(TRIM(split_part(COALESCE(NEW.email, ''), '@', 1)), ''),
    'player'
  );

  -- Normalize to match username rules used in the app UI.
  base_username := lower(base_username);
  base_username := regexp_replace(base_username, '[^a-z0-9_]+', '_', 'g');
  base_username := regexp_replace(base_username, '_+', '_', 'g');
  base_username := trim(both '_' from base_username);

  IF base_username IS NULL OR base_username = '' THEN
    base_username := 'player';
  END IF;

  IF length(base_username) < 3 THEN
    base_username := base_username || '_player';
  END IF;

  base_username := left(base_username, 20);
  candidate_username := base_username;

  LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.username = candidate_username
        AND p.id <> NEW.id
    );

    suffix := suffix + 1;
    candidate_username := left(base_username, GREATEST(1, 20 - length(suffix::text) - 1))
      || '_'
      || suffix::text;
  END LOOP;

  avatar_url := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'avatar_url'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'picture'), ''),
    NULL
  );

  INSERT INTO public.profiles (id, username, elo_rating, wins, losses, draws, avatar_url)
  VALUES (NEW.id, candidate_username, 1000, 0, 0, 0, avatar_url)
  ON CONFLICT (id) DO UPDATE SET
    avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
