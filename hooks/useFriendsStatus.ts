"use client";

import { useEffect, useMemo, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabaseClient } from "../lib/supabase";
import {
  parseUserStatus,
  resolveUserStatusForPresence,
  statusSortWeight,
  type UserStatus,
} from "../lib/statusUtils";
import { getPresenceStatuses, subscribePresenceState } from "./usePresence";

export type FriendWithStatus = {
  id: string;
  username: string;
  avatar_url: string | null;
  status: UserStatus;
  last_seen: string | null;
};

type FriendLinkRow = { friend_id: string };
type PresenceViewState = { ready: boolean; statuses: Map<string, UserStatus> };

function sortFriendsByStatusAndName(friends: FriendWithStatus[]) {
  friends.sort((a, b) => {
    const aWeight = statusSortWeight(a.status);
    const bWeight = statusSortWeight(b.status);
    if (aWeight !== bWeight) return aWeight - bWeight;
    return a.username.localeCompare(b.username);
  });
  return friends;
}

export function useFriendsStatus(userId: string | null) {
  const [friends, setFriends] = useState<FriendWithStatus[]>([]);
  const [presence, setPresence] = useState<PresenceViewState>({ ready: false, statuses: new Map() });
  const [presenceNow, setPresenceNow] = useState(() => Date.now());

  useEffect(() => {
    const unsubscribe = subscribePresenceState((state, hasSynced) => {
      setPresence({ ready: hasSynced, statuses: getPresenceStatuses(state) });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setPresenceNow(Date.now());
    }, 15_000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let loadVersion = 0;
    let friendsChannel: RealtimeChannel | null = null;
    let profileChannel: RealtimeChannel | null = null;
    let profileChannelVersion = 0;

    const rebuildProfileChannel = (ids: string[]) => {
      if (profileChannel) {
        supabaseClient.removeChannel(profileChannel);
        profileChannel = null;
      }

      if (ids.length === 0) return;

      const filter = `id=in.(${ids.join(",")})`;
      profileChannelVersion += 1;
      profileChannel = supabaseClient
        .channel(`friends-status-${userId}-${profileChannelVersion}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "profiles", filter },
          (payload: { new: { id: string; status?: string | null; last_seen?: string | null } }) => {
            const updatedId = payload.new.id;
            const updatedStatus = parseUserStatus(payload.new.status);
            const updatedLastSeen = payload.new.last_seen ?? null;
            setFriends((prev) =>
              sortFriendsByStatusAndName(
                prev.map((friend) =>
                  friend.id === updatedId
                    ? { ...friend, status: updatedStatus, last_seen: updatedLastSeen }
                    : friend
                )
              )
            );
          }
        )
        .subscribe();
    };

    const load = async () => {
      const version = ++loadVersion;
      const { data: links, error: linksError } = await supabaseClient
        .from("friends")
        .select("friend_id")
        .eq("user_id", userId);
      if (linksError) return;
      if (cancelled || version !== loadVersion) return;

      const ids = ((links ?? []) as FriendLinkRow[]).map((item) => item.friend_id);
      if (ids.length === 0) {
        setFriends([]);
        rebuildProfileChannel([]);
        return;
      }

      const { data, error } = await supabaseClient
        .from("profiles")
        .select("id, username, avatar_url, status, last_seen")
        .in("id", ids);
      if (error) return;
      if (cancelled || version !== loadVersion) return;

      const next = (data ?? []).map((row) => ({
        id: row.id,
        username: row.username ?? "Unknown",
        avatar_url: row.avatar_url ?? null,
        status: parseUserStatus(row.status),
        last_seen: row.last_seen ?? null,
      }));
      setFriends(sortFriendsByStatusAndName(next));
      rebuildProfileChannel(ids);
    };

    void load();
    friendsChannel = supabaseClient
      .channel(`friends-links-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friends", filter: `user_id=eq.${userId}` },
        () => {
          void load();
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      if (friendsChannel) supabaseClient.removeChannel(friendsChannel);
      if (profileChannel) supabaseClient.removeChannel(profileChannel);
    };
  }, [userId]);

  const displayFriends = useMemo(() => {
    const mapped = friends.map((friend) => ({
      ...friend,
      status: resolveUserStatusForPresence(friend.status, friend.last_seen, {
        presenceReady: presence.ready,
        liveStatus: presence.statuses.get(friend.id),
        now: presenceNow,
      }),
    }));

    mapped.sort((a, b) => {
      const aWeight = statusSortWeight(a.status);
      const bWeight = statusSortWeight(b.status);
      if (aWeight !== bWeight) return aWeight - bWeight;
      return a.username.localeCompare(b.username);
    });

    return mapped;
  }, [friends, presence, presenceNow]);

  return useMemo(() => ({ friends: userId ? displayFriends : [] }), [displayFriends, userId]);
}

