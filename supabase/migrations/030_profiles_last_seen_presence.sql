-- Add presence timestamp for online/offline detection
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS last_seen timestamptz;

-- Backfill existing rows so legacy users do not appear permanently offline
UPDATE public.profiles
SET last_seen = COALESCE(last_seen, NOW());

-- Helpful index for future presence queries/sorting
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen
ON public.profiles (last_seen DESC);

