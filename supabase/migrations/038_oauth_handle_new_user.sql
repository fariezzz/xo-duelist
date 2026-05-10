-- Update handle_new_user to support OAuth providers (Google, GitHub, Discord).
-- OAuth users don't pass 'username' in raw_user_meta_data.
-- Instead, we extract from provider-specific fields:
--   Google:  full_name or name
--   GitHub:  user_name or preferred_username
--   Discord: full_name or custom_claims.global_name
-- Falls back to email prefix if nothing found.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  derived_username text;
BEGIN
  -- Priority: explicit username > provider-specific fields > email prefix
  derived_username := COALESCE(
    -- 1. Explicit username (email/password registration)
    NULLIF(TRIM(NEW.raw_user_meta_data->>'username'), ''),
    -- 2. GitHub: user_name or preferred_username
    NULLIF(TRIM(NEW.raw_user_meta_data->>'user_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'preferred_username'), ''),
    -- 3. Google/Discord: full_name or name
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
    -- 4. Fallback: email prefix
    split_part(NEW.email, '@', 1)
  );

  -- Replace spaces with underscores for username compatibility
  derived_username := REPLACE(derived_username, ' ', '_');

  INSERT INTO public.profiles (id, username, elo_rating, wins, losses, draws, avatar_url)
  VALUES (
    NEW.id,
    derived_username,
    1000,
    0,
    0,
    0,
    NULLIF(TRIM(NEW.raw_user_meta_data->>'avatar_url'), '')
  )
  ON CONFLICT (id) DO UPDATE SET
    avatar_url = COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'avatar_url'), ''),
      profiles.avatar_url
    );

  RETURN NEW;
END;
$$;

-- Recreate trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
