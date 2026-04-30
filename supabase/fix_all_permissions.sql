-- ============================================================
-- COMPLETE FIX: Run this in Supabase Dashboard → SQL Editor
-- Fixes all RLS policies, realtime, and profile columns
-- Safe to run multiple times (uses IF NOT EXISTS / DROP IF EXISTS)
-- ============================================================

-- ═══════════════════════════════════════════════════
-- 1. ENABLE RLS ON ALL TABLES
-- ═══════════════════════════════════════════════════
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE matchmaking_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_history ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════
-- 2. PROFILES POLICIES
-- ═══════════════════════════════════════════════════
DROP POLICY IF EXISTS "profiles_insert_if_auth" ON profiles;
DROP POLICY IF EXISTS "profiles_select" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
DROP POLICY IF EXISTS "profiles_delete_own" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

CREATE POLICY "profiles_insert_if_auth" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (true);

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_delete_own" ON profiles
  FOR DELETE USING (auth.uid() = id);

-- ═══════════════════════════════════════════════════
-- 3. MATCHMAKING_QUEUE POLICIES
-- ═══════════════════════════════════════════════════
DROP POLICY IF EXISTS "queue_insert_own" ON matchmaking_queue;
DROP POLICY IF EXISTS "queue_select" ON matchmaking_queue;
DROP POLICY IF EXISTS "queue_delete_own" ON matchmaking_queue;
DROP POLICY IF EXISTS "queue_update_own" ON matchmaking_queue;

CREATE POLICY "queue_insert_own" ON matchmaking_queue
  FOR INSERT WITH CHECK (player_id = auth.uid());

CREATE POLICY "queue_select" ON matchmaking_queue
  FOR SELECT USING (true);

CREATE POLICY "queue_delete_own" ON matchmaking_queue
  FOR DELETE USING (player_id = auth.uid());

CREATE POLICY "queue_update_own" ON matchmaking_queue
  FOR UPDATE USING (player_id = auth.uid()) WITH CHECK (player_id = auth.uid());

-- ═══════════════════════════════════════════════════
-- 4. GAME_ROOMS POLICIES
-- ═══════════════════════════════════════════════════
DROP POLICY IF EXISTS "game_rooms_insert" ON game_rooms;
DROP POLICY IF EXISTS "game_rooms_insert_matchmaking" ON game_rooms;
DROP POLICY IF EXISTS "game_rooms_select" ON game_rooms;
DROP POLICY IF EXISTS "game_rooms_update_players" ON game_rooms;

-- Allow insert for any authenticated user (matchmaking creates rooms
-- where player1_id may be the opponent, not the current user)
CREATE POLICY "game_rooms_insert" ON game_rooms
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "game_rooms_select" ON game_rooms
  FOR SELECT USING (player1_id = auth.uid() OR player2_id = auth.uid());

CREATE POLICY "game_rooms_update_players" ON game_rooms
  FOR UPDATE USING (player1_id = auth.uid() OR player2_id = auth.uid())
  WITH CHECK (player1_id = auth.uid() OR player2_id = auth.uid());

-- ═══════════════════════════════════════════════════
-- 5. MATCH_HISTORY POLICIES
-- ═══════════════════════════════════════════════════
DROP POLICY IF EXISTS "match_history_select_involved" ON match_history;
DROP POLICY IF EXISTS "match_history_insert" ON match_history;

CREATE POLICY "match_history_select_involved" ON match_history
  FOR SELECT USING (player1_id = auth.uid() OR player2_id = auth.uid());

CREATE POLICY "match_history_insert" ON match_history
  FOR INSERT TO authenticated WITH CHECK (true);

-- ═══════════════════════════════════════════════════
-- 6. PROFILE COLUMNS (avatar, bio, updated_at)
-- ═══════════════════════════════════════════════════
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url text DEFAULT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio text DEFAULT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Auto-update trigger
CREATE OR REPLACE FUNCTION update_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_profiles_updated_at ON profiles;
CREATE TRIGGER trigger_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_profiles_updated_at();

-- ═══════════════════════════════════════════════════
-- 7. REALTIME
-- ═══════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

-- Add tables to realtime (ignore errors if already added)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE game_rooms;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE match_history;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE matchmaking_queue;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════
-- 8. STORAGE POLICIES FOR AVATARS
-- ═══════════════════════════════════════════════════
DROP POLICY IF EXISTS "Avatar upload policy" ON storage.objects;
DROP POLICY IF EXISTS "Avatar update policy" ON storage.objects;
DROP POLICY IF EXISTS "Avatar delete policy" ON storage.objects;
DROP POLICY IF EXISTS "Avatar select policy" ON storage.objects;

CREATE POLICY "Avatar upload policy"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "Avatar update policy"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'avatars');

CREATE POLICY "Avatar delete policy"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'avatars');

CREATE POLICY "Avatar select policy"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'avatars');

-- ═══════════════════════════════════════════════════
-- 9. AUTO-CREATE PROFILE ON REGISTRATION
-- When a user signs up, automatically create their profile row
-- ═══════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, elo_rating, wins, losses, draws)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'username',
      split_part(NEW.email, '@', 1)
    ),
    1000,
    0,
    0,
    0
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Drop and recreate to avoid duplicates
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
