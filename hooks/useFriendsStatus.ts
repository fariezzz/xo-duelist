"use client";

import { useEffect, useMemo, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabaseClient } from "../lib/supabase";
import type { UserStatus } from "../lib/statusUtils";
import { statusSortWeight } from "../lib/statusUtils";

export type FriendWithStatus = {
  id: string;
  username: string;
  avatar_url: string | null;
  status: UserStatus;
  last_seen: string | null;
};

type FriendLinkRow = { friend_id: string };

export function useFriendsStatus(userId: string | null) {
  const [friends, setFriends] = useState<FriendWithStatus[]>([]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    const load = async () => {
      const { data: links, error: linksError } = await supabaseClient
        .from("friends")
        .select("friend_id")
        .eq("user_id", userId);
      if (linksError) return;

      const ids = ((links ?? []) as FriendLinkRow[]).map((item) => item.friend_id);
      if (ids.length === 0) {
        if (!cancelled) setFriends([]);
        return;
      }

      const { data, error } = await supabaseClient
        .from("profiles")
        .select("id, username, avatar_url, status, last_seen")
        .in("id", ids);
      if (error) return;

      const next = (data ?? []).map((row) => ({
        id: row.id,
        username: row.username ?? "Unknown",
        avatar_url: row.avatar_url ?? null,
        status: (row.status ?? "offline") as UserStatus,
        last_seen: row.last_seen ?? null,
      }));
      next.sort((a, b) => {
        const aWeight = statusSortWeight(a.status);
        const bWeight = statusSortWeight(b.status);
        if (aWeight !== bWeight) return aWeight - bWeight;
        return a.username.localeCompare(b.username);
      });
      if (!cancelled) setFriends(next);

      const filter = `id=in.(${ids.join(",")})`;
      channel = supabaseClient
        .channel(`friends-status-${userId}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "profiles", filter },
          (payload: { new: { id: string; status?: string | null; last_seen?: string | null } }) => {
            const updatedId = payload.new.id;
            const updatedStatus = (payload.new.status ?? "offline") as UserStatus;
            const updatedLastSeen = payload.new.last_seen ?? null;
            setFriends((prev) => {
              const mapped = prev.map((friend) =>
                friend.id === updatedId
                  ? { ...friend, status: updatedStatus, last_seen: updatedLastSeen }
                  : friend
              );
              mapped.sort((a, b) => {
                const aWeight = statusSortWeight(a.status);
                const bWeight = statusSortWeight(b.status);
                if (aWeight !== bWeight) return aWeight - bWeight;
                return a.username.localeCompare(b.username);
              });
              return mapped;
            });
          }
        )
        .subscribe();
    };

    void load();

    return () => {
      cancelled = true;
      if (channel) supabaseClient.removeChannel(channel);
    };
  }, [userId]);

  return useMemo(() => ({ friends }), [friends]);
}

