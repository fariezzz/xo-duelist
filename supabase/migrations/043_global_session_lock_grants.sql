-- Ensure the global session lock TTL is short enough for near-real-time device enforcement.
-- The claim_scoped_session_lock function already supports TTL per-call,
-- so this migration just documents the intent and adjusts the default TTL
-- for the global scope to 20s (matching our 4s heartbeat × 5 grace intervals).
-- No schema changes needed; the default TTL is passed from the client.

-- Grant execute on the RPC to authenticated users (idempotent).
grant execute on function public.claim_scoped_session_lock(text, text, integer, boolean) to authenticated;
grant execute on function public.release_scoped_session_lock(text, text) to authenticated;
