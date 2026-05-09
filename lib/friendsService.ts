import { supabaseClient } from "./supabase";

export type FriendProfileRow = {
  id: string;
  username: string;
  elo_rating: number;
  avatar_url: string | null;
  status: string | null;
  last_seen: string | null;
};

export type PublicMatchRow = {
  id: string;
  room_id: string;
  player1_id: string;
  player2_id: string;
  winner_id: string | null;
  loser_id: string | null;
  played_at: string;
  match_type: string | null;
};

export type PublicProfileView = {
  id: string;
  username: string;
  elo_rating: number;
  avatar_url: string | null;
  status: string | null;
  last_seen: string | null;
  wins: number;
  losses: number;
  draws: number;
};

export async function deleteFriendship(meId: string, friendId: string): Promise<void> {
  const { error: a } = await supabaseClient.from("friends").delete().eq("user_id", meId).eq("friend_id", friendId);
  if (a) throw a;
  const { error: b } = await supabaseClient.from("friends").delete().eq("user_id", friendId).eq("friend_id", meId);
  if (b) throw b;
}

export async function fetchFriendSuggestions(
  meId: string,
  centerElo: number,
  excludeIds: string[],
  limit = 3
): Promise<Pick<FriendProfileRow, "id" | "username" | "avatar_url" | "elo_rating">[]> {
  const exclude = new Set(excludeIds);
  exclude.add(meId);

  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, username, avatar_url, elo_rating")
    .gte("elo_rating", centerElo - 100)
    .lte("elo_rating", centerElo + 100)
    .order("elo_rating", { ascending: true })
    .limit(48);

  if (error) throw error;

  const rows = (data ?? []).filter((row) => row.id && !exclude.has(row.id));
  return rows.slice(0, limit) as Pick<FriendProfileRow, "id" | "username" | "avatar_url" | "elo_rating">[];
}

export async function searchProfilesByKeyword(
  meId: string,
  keyword: string,
  maxResults = 12
): Promise<FriendProfileRow[]> {
  const trimmed = keyword.trim();
  if (trimmed.length < 2) return [];

  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, username, elo_rating, avatar_url, status, last_seen")
    .ilike("username", `%${trimmed}%`)
    .neq("id", meId)
    .limit(maxResults);

  if (error) throw error;
  return (data ?? []) as FriendProfileRow[];
}

export async function getPublicProfileByUsername(username: string): Promise<PublicProfileView | null> {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, username, elo_rating, avatar_url, status, last_seen, wins, losses, draws")
    .eq("username", username)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    username: data.username,
    elo_rating: data.elo_rating ?? 1000,
    avatar_url: data.avatar_url ?? null,
    status: data.status ?? null,
    last_seen: data.last_seen ?? null,
    wins: data.wins ?? 0,
    losses: data.losses ?? 0,
    draws: data.draws ?? 0,
  };
}

export async function getPublicProfileMatches(profileId: string, limit = 10): Promise<PublicMatchRow[]> {
  const { data, error } = await supabaseClient.rpc("get_public_profile_matches", {
    p_profile_id: profileId,
    p_limit: limit,
  });

  if (error) throw error;
  return (data ?? []) as PublicMatchRow[];
}
