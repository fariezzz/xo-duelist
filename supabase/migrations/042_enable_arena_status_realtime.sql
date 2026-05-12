-- Ensure dashboard realtime subscriptions receive changes when the tables exist.
DO $$
BEGIN
  IF to_regclass('public.game_invites') IS NOT NULL THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.game_invites;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;

  IF to_regclass('public.game_rooms') IS NOT NULL THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.game_rooms;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;

  IF to_regclass('public.matchmaking_queue') IS NOT NULL THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.matchmaking_queue;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;

  IF to_regclass('public.friends') IS NOT NULL THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.friends;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;
