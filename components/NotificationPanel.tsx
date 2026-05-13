"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient } from "../lib/supabase";

// ── Types ────────────────────────────────────────────────────

type FriendRequest = {
  id: string;
  sender_id: string;
  status: string;
  created_at: string;
  sender_username?: string;
  sender_avatar?: string | null;
};

type GameInvite = {
  id: string;
  sender_id: string;
  status: string;
  created_at: string;
  expires_at: string | null;
  sender_username?: string;
  sender_avatar?: string | null;
};

type NotifItem =
  | { kind: "friend_request"; data: FriendRequest }
  | { kind: "game_invite"; data: GameInvite };

// ── Component ────────────────────────────────────────────────

export default function NotificationPanel({
  userId,
  isOpen,
  onClose,
  onCountChange,
}: {
  userId: string;
  isOpen: boolean;
  onClose: () => void;
  onCountChange: (count: number) => void;
}) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const [friendReqs, setFriendReqs] = useState<FriendRequest[]>([]);
  const [invites, setInvites] = useState<GameInvite[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | "friends" | "invites">("all");

  // ── Fetch friend requests ────────────────────────────────
  const fetchFriendRequests = useCallback(async () => {
    const { data } = await supabaseClient
      .from("friend_requests")
      .select("id, sender_id, status, created_at")
      .eq("receiver_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(20);

    if (!data) return;

    // Fetch sender profiles
    const senderIds = data.map((r: any) => r.sender_id);
    const { data: profiles } = senderIds.length
      ? await supabaseClient
          .from("profiles")
          .select("id, username, avatar_url")
          .in("id", senderIds)
      : { data: [] };

    const profileMap = new Map(
      (profiles ?? []).map((p: any) => [p.id, p])
    );

    setFriendReqs(
      data.map((r: any) => ({
        ...r,
        sender_username:
          (profileMap.get(r.sender_id) as any)?.username ?? "Unknown",
        sender_avatar:
          (profileMap.get(r.sender_id) as any)?.avatar_url ?? null,
      }))
    );
  }, [userId]);

  // ── Fetch game invites ───────────────────────────────────
  const fetchInvites = useCallback(async () => {
    const { data } = await supabaseClient
      .from("game_invites")
      .select("id, sender_id, status, created_at, expires_at")
      .eq("receiver_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(20);

    if (!data) return;

    const senderIds = data.map((r: any) => r.sender_id);
    const { data: profiles } = senderIds.length
      ? await supabaseClient
          .from("profiles")
          .select("id, username, avatar_url")
          .in("id", senderIds)
      : { data: [] };

    const profileMap = new Map(
      (profiles ?? []).map((p: any) => [p.id, p])
    );

    // Filter out expired
    const now = Date.now();
    setInvites(
      data
        .filter(
          (inv: any) =>
            !inv.expires_at || new Date(inv.expires_at).getTime() > now
        )
        .map((r: any) => ({
          ...r,
          sender_username:
            (profileMap.get(r.sender_id) as any)?.username ?? "Unknown",
          sender_avatar:
            (profileMap.get(r.sender_id) as any)?.avatar_url ?? null,
        }))
    );
  }, [userId]);

  // ── Load data & subscribe ────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    fetchFriendRequests();
    fetchInvites();

    const frCh = supabaseClient
      .channel(`notif-fr-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "friend_requests",
          filter: `receiver_id=eq.${userId}`,
        },
        () => fetchFriendRequests()
      )
      .subscribe();

    const invCh = supabaseClient
      .channel(`notif-inv-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_invites",
          filter: `receiver_id=eq.${userId}`,
        },
        () => fetchInvites()
      )
      .subscribe();

    return () => {
      supabaseClient.removeChannel(frCh);
      supabaseClient.removeChannel(invCh);
    };
  }, [userId, fetchFriendRequests, fetchInvites]);

  // ── Report count to parent ───────────────────────────────
  useEffect(() => {
    onCountChange(friendReqs.length + invites.length);
  }, [friendReqs.length, invites.length, onCountChange]);

  // ── Close on outside click ───────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    // Use setTimeout so the opening click doesn't immediately close
    const t = setTimeout(
      () => document.addEventListener("mousedown", handleClick),
      0
    );
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [isOpen, onClose]);

  // ── Actions ──────────────────────────────────────────────
  async function acceptFriend(id: string) {
    setActionLoading(id);
    await supabaseClient.rpc("respond_friend_request", {
      input_request_id: id,
      input_accept: true,
    });
    setActionLoading(null);
    fetchFriendRequests();
  }

  async function declineFriend(id: string) {
    setActionLoading(id);
    await supabaseClient.rpc("respond_friend_request", {
      input_request_id: id,
      input_accept: false,
    });
    setActionLoading(null);
    fetchFriendRequests();
  }

  async function acceptInvite(id: string) {
    setActionLoading(id);
    try {
      const { data, error } = await supabaseClient.rpc(
        "respond_game_invite",
        { input_invite_id: id, input_accept: true }
      );
      if (error) throw error;
      const room = Array.isArray(data) ? data[0] : data;
      if (room?.room_id) {
        onClose();
        router.push(`/game/${room.room_id}`);
      }
    } catch {
      /* handled by popup */
    }
    setActionLoading(null);
    fetchInvites();
  }

  async function declineInvite(id: string) {
    setActionLoading(id);
    await supabaseClient.rpc("respond_game_invite", {
      input_invite_id: id,
      input_accept: false,
    });
    setActionLoading(null);
    fetchInvites();
  }

  if (!isOpen) return null;

  // ── Build items list ─────────────────────────────────────
  let items: NotifItem[] = [];
  if (tab === "all" || tab === "friends") {
    items.push(
      ...friendReqs.map(
        (d) => ({ kind: "friend_request" as const, data: d })
      )
    );
  }
  if (tab === "all" || tab === "invites") {
    items.push(
      ...invites.map(
        (d) => ({ kind: "game_invite" as const, data: d })
      )
    );
  }
  items.sort(
    (a, b) =>
      new Date(b.data.created_at).getTime() -
      new Date(a.data.created_at).getTime()
  );

  // ── Render ───────────────────────────────────────────────
  return (
    <div
      ref={panelRef}
      className="notification-panel"
      style={{
        position: "absolute",
        top: "calc(100% + 10px)",
        right: 0,
        width: "360px",
        maxHeight: "440px",
        background: "rgba(13, 21, 38, 0.98)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "14px",
        backdropFilter: "blur(20px)",
        boxShadow:
          "0 12px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)",
        overflow: "hidden",
        animation: "scaleIn 0.15s ease-out forwards",
        transformOrigin: "top right",
        display: "flex",
        flexDirection: "column",
        zIndex: 100,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "14px 16px 10px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-heading)",
            fontWeight: 800,
            fontSize: "0.95rem",
            marginBottom: "10px",
          }}
        >
          Notifications
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: "4px" }}>
          {(
            [
              { key: "all", label: "All" },
              {
                key: "friends",
                label: `Friends${friendReqs.length ? ` (${friendReqs.length})` : ""}`,
              },
              {
                key: "invites",
                label: `Invites${invites.length ? ` (${invites.length})` : ""}`,
              },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: "5px 12px",
                borderRadius: "8px",
                border: "none",
                fontSize: "0.75rem",
                fontFamily: "var(--font-heading)",
                fontWeight: tab === t.key ? 700 : 500,
                cursor: "pointer",
                background:
                  tab === t.key
                    ? "rgba(124,58,237,0.2)"
                    : "transparent",
                color:
                  tab === t.key ? "#a78bfa" : "var(--text-muted)",
                transition: "all 0.15s",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Items */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "6px 0",
        }}
      >
        {items.length === 0 ? (
          <div
            style={{
              padding: "40px 20px",
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: "0.85rem",
            }}
          >
            <div style={{ fontSize: "1.5rem", marginBottom: "8px", opacity: 0.5 }}>🔔</div>
            No new notifications
          </div>
        ) : (
          items.map((item) => {
            const isLoading = actionLoading === item.data.id;

            if (item.kind === "friend_request") {
              const fr = item.data;
              return (
                <NotifRow
                  key={`fr-${fr.id}`}
                  icon="👤"
                  iconBg="rgba(59,130,246,0.15)"
                  title={fr.sender_username ?? "Unknown"}
                  subtitle="sent you a friend request"
                  time={fr.created_at}
                  actions={
                    <>
                      <SmallBtn
                        label="Accept"
                        color="#10b981"
                        loading={isLoading}
                        onClick={() => acceptFriend(fr.id)}
                      />
                      <SmallBtn
                        label="Decline"
                        color="#ef4444"
                        ghost
                        loading={isLoading}
                        onClick={() => declineFriend(fr.id)}
                      />
                    </>
                  }
                />
              );
            }

            const inv = item.data as GameInvite;
            return (
              <NotifRow
                key={`inv-${inv.id}`}
                icon="⚔️"
                iconBg="rgba(245,158,11,0.15)"
                title={inv.sender_username ?? "Unknown"}
                subtitle="invited you to play"
                time={inv.created_at}
                expires={inv.expires_at}
                actions={
                  <>
                    <SmallBtn
                      label="Accept"
                      color="#10b981"
                      loading={isLoading}
                      onClick={() => acceptInvite(inv.id)}
                    />
                    <SmallBtn
                      label="Decline"
                      color="#ef4444"
                      ghost
                      loading={isLoading}
                      onClick={() => declineInvite(inv.id)}
                    />
                  </>
                }
              />
            );
          })
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "8px 12px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          textAlign: "center",
        }}
      >
        <button
          onClick={() => {
            onClose();
            router.push("/friends");
          }}
          style={{
            background: "transparent",
            border: "none",
            color: "#a78bfa",
            fontSize: "0.78rem",
            fontFamily: "var(--font-heading)",
            fontWeight: 600,
            cursor: "pointer",
            padding: "4px 8px",
          }}
        >
          View All Friends →
        </button>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function NotifRow({
  icon,
  iconBg,
  title,
  subtitle,
  time,
  expires,
  actions,
}: {
  icon: string;
  iconBg: string;
  title: string;
  subtitle: string;
  time: string;
  expires?: string | null;
  actions: React.ReactNode;
}) {
  const remainSec = expires
    ? Math.max(
        0,
        Math.floor(
          (new Date(expires).getTime() - Date.now()) / 1000
        )
      )
    : null;

  return (
    <div
      style={{
        padding: "10px 16px",
        display: "flex",
        gap: "10px",
        alignItems: "flex-start",
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.background =
          "rgba(255,255,255,0.03)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.background = "transparent")
      }
    >
      {/* Icon */}
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: "10px",
          background: iconBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "0.95rem",
          flexShrink: 0,
          marginTop: "2px",
        }}
      >
        {icon}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "0.82rem", lineHeight: 1.4 }}>
          <span
            style={{
              fontFamily: "var(--font-heading)",
              fontWeight: 700,
            }}
          >
            {title}
          </span>{" "}
          <span style={{ color: "var(--text-muted)" }}>
            {subtitle}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginTop: "3px",
          }}
        >
          <span
            style={{
              fontSize: "0.68rem",
              color: "var(--text-muted)",
              opacity: 0.7,
            }}
          >
            {timeAgo(time)}
          </span>
          {remainSec !== null && remainSec > 0 && (
            <span
              style={{
                fontSize: "0.65rem",
                padding: "1px 6px",
                borderRadius: "6px",
                background: "rgba(245,158,11,0.12)",
                color: "#fbbf24",
                fontFamily: "var(--font-heading)",
                fontWeight: 600,
              }}
            >
              {remainSec}s left
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div
          style={{
            display: "flex",
            gap: "6px",
            marginTop: "6px",
          }}
        >
          {actions}
        </div>
      </div>
    </div>
  );
}

function SmallBtn({
  label,
  color,
  ghost,
  loading,
  onClick,
}: {
  label: string;
  color: string;
  ghost?: boolean;
  loading?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        padding: "4px 12px",
        borderRadius: "8px",
        border: ghost
          ? `1px solid ${color}33`
          : "1px solid transparent",
        background: ghost ? "transparent" : `${color}22`,
        color: color,
        fontSize: "0.72rem",
        fontFamily: "var(--font-heading)",
        fontWeight: 700,
        cursor: loading ? "wait" : "pointer",
        opacity: loading ? 0.5 : 1,
        transition: "all 0.15s",
      }}
    >
      {loading ? "..." : label}
    </button>
  );
}
