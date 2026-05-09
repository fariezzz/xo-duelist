ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'offline';

ALTER TABLE public.profiles
  ALTER COLUMN last_seen SET DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'Users can update own status'
  ) THEN
    CREATE POLICY "Users can update own status"
    ON public.profiles
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);
  END IF;
END $$;
