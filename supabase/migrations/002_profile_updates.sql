-- ============================================================
-- Run this DIRECTLY in Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Add columns (safe to run multiple times)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url text DEFAULT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio text DEFAULT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 2. Auto-update trigger
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

-- 3. Make sure profiles table has proper RLS for UPDATE
-- (allows users to update their own profile)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles' AND policyname = 'Users can update own profile'
  ) THEN
    CREATE POLICY "Users can update own profile"
      ON profiles FOR UPDATE
      TO authenticated
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- 4. Storage RLS for avatars bucket
-- Drop old policies if they exist (from failed migration)
DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
DROP POLICY IF EXISTS "Avatar upload policy" ON storage.objects;
DROP POLICY IF EXISTS "Avatar update policy" ON storage.objects;
DROP POLICY IF EXISTS "Avatar delete policy" ON storage.objects;
DROP POLICY IF EXISTS "Avatar select policy" ON storage.objects;

-- Simple policies: authenticated users can manage files in avatars bucket
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
