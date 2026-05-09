import { supabaseClient } from "./supabase";

export async function touchPresenceNow(userId?: string | null): Promise<void> {
  let uid = userId ?? null;

  if (!uid) {
    const { data: sessionData } = await supabaseClient.auth.getSession();
    uid = sessionData.session?.user.id ?? null;
  }

  if (!uid) return;

  const { error } = await supabaseClient
    .from("profiles")
    .update({ last_seen: new Date().toISOString() })
    .eq("id", uid);

  if (error) {
    console.warn("Presence update failed:", error.message);
  }
}

