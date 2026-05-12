"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient } from "../lib/supabase";

type GameInvite = {
  id: string;
  sender_id: string;
  receiver_id: string;
  room_id: string | null;
  status: "pending" | "accepted" | "declined" | "cancelled" | "expired";
  created_at: string;
  responded_at: string | null;
  expires_at: string | null;
};

type Profile = {
  id: string;
  username: string;
  elo_rating: number;
  avatar_url: string | null;
};

type PopupInvite = GameInvite & {
  senderProfile: Profile | null;
};

function formatInviteError(message: string) {
  const lower = message.toLowerCase();

  if (lower.includes("sender_busy")) {
    return "You are currently in a room, match, or matchmaking.";
  }
  if (lower.includes("receiver_busy")) {
    return "That player is currently in a room, match, or matchmaking.";
  }
  if (
    lower.includes("player_is_busy") ||
    lower.includes("one_player_already_in_match") ||
    lower.includes("one_player_already_matchmaking")
  ) {
    return "A player is currently in a room, match, or matchmaking.";
  }
  if (lower.includes("invite_expired")) {
    return "This invite has expired.";
  }
  if (lower.includes("invite_cancelled")) {
    return "This invite has been cancelled.";
  }
  if (lower.includes("invite_already_resolved")) {
    return "This invite has already been resolved.";
  }
  if (lower.includes("invite_not_found")) {
    return "This invite is no longer available.";
  }
  if (lower.includes("not_authenticated")) {
    return "You need to sign in first.";
  }

  return message || "Failed to process invite.";
}

export default function GameInvitePopup({
  currentUserId,
}: {
  currentUserId: string | null;
}) {
  const router = useRouter();

  const [invite, setInvite] = useState<PopupInvite | null>(null);
  const [loadingAction, setLoadingAction] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startNotice, setStartNotice] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function clearCountdown() {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setCountdown(null);
  }

  function startCountdown(expiresAt: string | null) {
    clearCountdown();
    if (!expiresAt) return;

    const expiresMs = new Date(expiresAt).getTime();
    if (!Number.isFinite(expiresMs)) return;

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((expiresMs - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining <= 0) {
        clearCountdown();
        // Auto-dismiss expired invite
        setInvite((current) => {
          if (current && current.expires_at === expiresAt) return null;
          return current;
        });
      }
    };

    tick();
    countdownRef.current = setInterval(tick, 1000);
  }

  async function getSenderProfile(senderId: string) {
    const { data } = await supabaseClient
      .from("profiles")
      .select("id, username, elo_rating, avatar_url")
      .eq("id", senderId)
      .maybeSingle();

    return (data ?? null) as Profile | null;
  }

  async function showIncomingInvite(row: GameInvite) {
    if (row.status !== "pending") return;

    // Check if already expired by time
    if (row.expires_at) {
      const expiresMs = new Date(row.expires_at).getTime();
      if (Number.isFinite(expiresMs) && expiresMs <= Date.now()) return;
    }

    const senderProfile = await getSenderProfile(row.sender_id);

    setInvite({
      ...row,
      senderProfile,
    });

    setError(null);
    startCountdown(row.expires_at);
  }

  async function loadPendingInvite(userId: string) {
    const { data, error } = await supabaseClient
      .from("game_invites")
      .select("*")
      .eq("receiver_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn("Failed to load pending invite:", error.message);
      return;
    }

    if (data) {
      await showIncomingInvite(data as GameInvite);
    } else {
      setInvite(null);
      clearCountdown();
    }
  }

function redirectToLobby(roomId: string) {
  const currentPath =
    typeof window !== "undefined" ? window.location.pathname : "";

  if (currentPath === `/lobby/${roomId}`) return;

  setStartNotice("Invite accepted! Opening lobby...");

  setTimeout(() => {
    router.push(`/lobby/${roomId}`);
  }, 700);

  setTimeout(() => setStartNotice(null), 2500);
}

  useEffect(() => {
    if (!currentUserId) {
      setInvite(null);
      setStartNotice(null);
      clearCountdown();
      return;
    }

    loadPendingInvite(currentUserId);

    const channel = supabaseClient
      .channel(`global-game-invite-${currentUserId}`)

      // Receiver gets a popup when a new invite arrives
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "game_invites",
          filter: `receiver_id=eq.${currentUserId}`,
        },
        async (payload) => {
          const row = payload.new as GameInvite;

          if (row.status === "pending") {
            await showIncomingInvite(row);
          }
        }
      )

      // Receiver: close popup when invite status changes
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "game_invites",
          filter: `receiver_id=eq.${currentUserId}`,
        },
        async (payload) => {
          const row = payload.new as GameInvite;

          if (row.status !== "pending") {
            setInvite((current) => {
              if (current?.id === row.id) {
                clearCountdown();
                return null;
              }
              return current;
            });
          }

          if (row.status === "accepted" && row.room_id) {
            redirectToLobby(row.room_id);
          }

          // Show notice for cancelled invites
          if (row.status === "cancelled") {
            setStartNotice("Invite was cancelled by the sender.");
            setTimeout(() => setStartNotice(null), 2200);
          }

          if (row.status === "expired") {
            setStartNotice("Invite has expired.");
            setTimeout(() => setStartNotice(null), 2200);
          }
        }
      )

      // Sender: auto-enter room when invite is accepted
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "game_invites",
          filter: `sender_id=eq.${currentUserId}`,
        },
        async (payload) => {
          const row = payload.new as GameInvite;

          if (row.status === "accepted" && row.room_id) {
           redirectToLobby(row.room_id);
          }

          if (row.status === "declined") {
            setStartNotice("Invite was declined.");
            setTimeout(() => setStartNotice(null), 2200);
          }

          if (row.status === "expired") {
            setStartNotice("Invite has expired.");
            setTimeout(() => setStartNotice(null), 2200);
          }
        }
      )
      .subscribe();

    return () => {
      supabaseClient.removeChannel(channel);
      clearCountdown();
    };
  }, [currentUserId, router]);

  async function respondInvite(accept: boolean) {
    if (!invite || loadingAction) return;

    try {
      setLoadingAction(true);
      setError(null);

      const { data: roomId, error } = await supabaseClient.rpc(
        "respond_game_invite",
        {
          input_invite_id: invite.id,
          input_accept: accept,
        }
      );

      if (error) throw error;

      setInvite(null);
      clearCountdown();

      if (accept && roomId) {
        redirectToLobby(roomId);
      }
    } catch (err: any) {
      console.error("Failed to respond invite:", err);
      setError(formatInviteError(err?.message || "Failed to respond invite"));
    } finally {
      setLoadingAction(false);
    }
  }

  const floatingNotice = startNotice ? (
    <div
      style={{
        position: "fixed",
        top: "calc(var(--navbar-height) + 18px)",
        right: "24px",
        zIndex: 5000,
        width: "min(360px, calc(100vw - 32px))",
      }}
    >
      <div
        className="card"
        style={{
          padding: "14px 16px",
          borderColor: "rgba(16,185,129,0.45)",
          boxShadow:
            "0 18px 50px rgba(0,0,0,0.45), 0 0 34px rgba(16,185,129,0.18)",
          background: "rgba(13, 21, 38, 0.97)",
          color: "var(--text-primary)",
          fontFamily: "var(--font-heading)",
          fontWeight: 800,
        }}
      >
        {startNotice}
      </div>
    </div>
  ) : null;

  if (!invite) {
    return floatingNotice;
  }

  const senderName = invite.senderProfile?.username ?? "A player";
  const senderElo = invite.senderProfile?.elo_rating ?? 1000;
  const avatarUrl = invite.senderProfile?.avatar_url;

  // Countdown ring percentage (30s total)
  const countdownPct = countdown !== null ? Math.max(0, (countdown / 30) * 100) : 100;

  return (
    <>
      {floatingNotice}

      <div
        style={{
          position: "fixed",
          top: "calc(var(--navbar-height) + 18px)",
          right: "24px",
          zIndex: 5000,
          width: "min(360px, calc(100vw - 32px))",
          animation: "scaleIn 0.18s ease-out forwards",
        }}
      >
        <div
          className="card"
          style={{
            padding: "18px",
            borderColor: "rgba(124,58,237,0.45)",
            boxShadow:
              "0 18px 50px rgba(0,0,0,0.45), 0 0 34px rgba(124,58,237,0.22)",
            background: "rgba(13, 21, 38, 0.97)",
            backdropFilter: "blur(18px)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginBottom: "14px",
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                overflow: "hidden",
                background: avatarUrl
                  ? "transparent"
                  : "linear-gradient(135deg, #7c3aed, #f59e0b)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "var(--font-heading)",
                fontWeight: 800,
                color: "white",
                flexShrink: 0,
              }}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={senderName}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              ) : (
                senderName.charAt(0).toUpperCase()
              )}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: "var(--font-heading)",
                  fontWeight: 800,
                  color: "var(--text-primary)",
                  fontSize: "1rem",
                }}
              >
                 {"\u2694\uFE0F Match Invite"}
              </div>

              <div
                style={{
                  color: "var(--text-muted)",
                  fontSize: "0.84rem",
                  marginTop: "2px",
                  lineHeight: 1.4,
                }}
              >
                <b style={{ color: "var(--text-primary)" }}>{senderName}</b>{" "}
                invited you to play.
              </div>

              <div
                style={{
                  color: "#f59e0b",
                  fontSize: "0.78rem",
                  marginTop: "3px",
                  fontFamily: "var(--font-heading)",
                  fontWeight: 700,
                }}
              >
                ELO {senderElo}
              </div>
            </div>

            {/* Countdown badge */}
            {countdown !== null && (
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background: `conic-gradient(${countdown <= 5 ? "#ef4444" : "#7c3aed"} ${countdownPct}%, rgba(255,255,255,0.06) 0%)`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: "rgba(13, 21, 38, 0.95)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "var(--font-heading)",
                    fontWeight: 800,
                    fontSize: "0.82rem",
                    color: countdown <= 5 ? "#ef4444" : "#e2e8f0",
                  }}
                >
                  {countdown}
                </div>
              </div>
            )}
          </div>

          {error && (
            <div
              style={{
                color: "#ef4444",
                fontSize: "0.8rem",
                marginBottom: "12px",
                lineHeight: 1.4,
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: "10px" }}>
            <button
              className="btn btn-primary"
              disabled={loadingAction}
              onClick={() => respondInvite(true)}
              style={{ flex: 1 }}
            >
              {loadingAction ? "Loading..." : "Accept"}
            </button>

            <button
              className="btn btn-ghost"
              disabled={loadingAction}
              onClick={() => respondInvite(false)}
              style={{ flex: 1 }}
            >
              Decline
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

