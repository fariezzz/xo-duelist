"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabaseClient } from "../lib/supabase";

export type LobbyPresenceMeta = {
  user_id: string;
  username: string;
  role: "host" | "guest";
  joined_at: string;
};

export type LobbyPresenceEvent =
  | { type: "player_joined"; player: LobbyPresenceMeta }
  | { type: "guest_left"; player: LobbyPresenceMeta }
  | { type: "host_left"; player: LobbyPresenceMeta };

type UseLobbyPresenceOptions = {
  roomId: string;
  userId: string;
  username: string;
  isHost: boolean;
  /** Called when a presence event fires that the page should react to */
  onEvent: (event: LobbyPresenceEvent) => void;
};

/**
 * Presence-based lobby connection hook.
 *
 * Every player in the waiting room subscribes to a room-specific presence
 * channel. When a player disconnects for ANY reason (back button, tab close,
 * crash, internet loss), Supabase Presence fires a 'leave' event on the
 * remaining player's client. That event triggers cleanup logic.
 *
 * This replaces beforeunload hacks, heartbeat polling, and navigation guards.
 */
export function useLobbyPresence({
  roomId,
  userId,
  username,
  isHost,
  onEvent,
}: UseLobbyPresenceOptions) {
  const [presentPlayers, setPresentPlayers] = useState<LobbyPresenceMeta[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const onEventRef = useRef(onEvent);

  // Keep callback ref fresh without re-subscribing the channel
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const disconnect = useCallback(() => {
    if (channelRef.current) {
      try {
        void channelRef.current.untrack();
      } catch { /* ignore */ }
      supabaseClient.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setIsConnected(false);
  }, []);

  useEffect(() => {
    if (!roomId || !userId || !username) return;

    const channelName = `lobby-presence-${roomId}`;
    const channel = supabaseClient.channel(channelName, {
      config: { presence: { key: userId } },
    });
    channelRef.current = channel;

    const extractPlayers = (): LobbyPresenceMeta[] => {
      const state = channel.presenceState<LobbyPresenceMeta>();
      const all: LobbyPresenceMeta[] = [];
      for (const metas of Object.values(state)) {
        for (const meta of metas as LobbyPresenceMeta[]) {
          if (meta.user_id) all.push(meta);
        }
      }
      return all;
    };

    channel
      .on("presence", { event: "sync" }, () => {
        setPresentPlayers(extractPlayers());
      })
      .on(
        "presence",
        { event: "join" },
        ({ newPresences }: { newPresences: LobbyPresenceMeta[] }) => {
          const joined = newPresences[0];
          if (joined && joined.user_id !== userId) {
            onEventRef.current({ type: "player_joined", player: joined });
          }
          setPresentPlayers(extractPlayers());
        }
      )
      .on(
        "presence",
        { event: "leave" },
        ({ leftPresences }: { leftPresences: LobbyPresenceMeta[] }) => {
          const left = leftPresences[0];
          if (!left || left.user_id === userId) return;

          if (left.role === "guest") {
            onEventRef.current({ type: "guest_left", player: left });
          } else if (left.role === "host") {
            onEventRef.current({ type: "host_left", player: left });
          }
          setPresentPlayers(extractPlayers());
        }
      )
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          setIsConnected(true);
          await channel.track({
            user_id: userId,
            username,
            role: isHost ? "host" : "guest",
            joined_at: new Date().toISOString(),
          } satisfies LobbyPresenceMeta);
        }
      });

    return () => {
      disconnect();
    };
  }, [roomId, userId, username, isHost, disconnect]);

  return {
    /** Players currently present in the channel */
    presentPlayers,
    /** Whether the local client is connected to the presence channel */
    isConnected,
    /**
     * Gracefully leave the presence channel.
     * Triggers 'leave' event on the opponent's side.
     * All DB cleanup happens via that leave event — no manual cleanup needed.
     */
    disconnect,
  };
}
