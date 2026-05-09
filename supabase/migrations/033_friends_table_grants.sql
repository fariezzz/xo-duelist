-- Table privileges for friends (RLS alone is not enough; roles need GRANT)
GRANT SELECT, DELETE ON TABLE public.friends TO authenticated;
GRANT ALL ON TABLE public.friends TO service_role;
