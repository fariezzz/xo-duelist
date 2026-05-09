"use client";

import React from "react";
import type { UserStatus } from "../lib/statusUtils";
import { STATUS_LABEL } from "../lib/statusUtils";
import StatusDot from "./ui/StatusDot";

export type FriendPresenceItem = {
  id: string;
  username: string;
  avatarUrl: string | null;
  status: UserStatus;
  lastSeen?: string | null;
};

type RightPanelProps = {
  inviteCount: number;
  friends: FriendPresenceItem[];
  totalFriends: number;
  onlineCounts: { totalOnline: number; inMatchmaking: number; inGame: number };
  onViewFriends: () => void;
  onInviteFriend: (friendId: string) => void;
  /** ID of the friend currently being invited (loading state) */
  invitingFriendId?: string | null;
  /** Outgoing pending invite receiver IDs — show "Cancel" button */
  outgoingInviteMap?: Map<string, string>; // friendId -> inviteId
  onCancelInvite?: (inviteId: string) => void;
  cancellingInviteId?: string | null;
};

function initialsFromName(name: string): string {
  const initials = name
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return initials || "?";
}

export default function RightPanel({
  inviteCount,
  friends,
  totalFriends,
  onlineCounts,
  onViewFriends,
  onInviteFriend,
  invitingFriendId,
  outgoingInviteMap,
  onCancelInvite,
  cancellingInviteId,
}: RightPanelProps) {
  const onlineCount = friends.filter((friend) => friend.status !== "offline").length;

  const relativeMinutes = (value?: string | null) => {
    if (!value) return "Last seen recently";
    const ts = new Date(value).getTime();
    if (!Number.isFinite(ts)) return "Last seen recently";
    const minutes = Math.max(1, Math.floor((Date.now() - ts) / 60000));
    return `${minutes} min ago`;
  };

  return (
    <aside className="rp-root">
      <section className="rp-card">
        <div className="rp-card-title">
          <span>{"\u{1F514}"}</span>
          <span>Arena Status</span>
        </div>
        <div className="rp-info-row">
          <span>Players Online</span>
          <strong style={{ color: "#10b981" }}>{onlineCounts.totalOnline}</strong>
        </div>
        <div className="rp-info-row">
          <span>In Queue</span>
          <strong style={{ color: "#f59e0b" }}>{onlineCounts.inMatchmaking}</strong>
        </div>
        <div className="rp-info-row">
          <span>Matches Active</span>
          <strong style={{ color: "#ef4444" }}>{onlineCounts.inGame}</strong>
        </div>
        <div className="rp-info-row">
          <span>Match invites</span>
          <strong style={{ color: inviteCount > 0 ? "#10b981" : "#94a3b8" }}>{inviteCount}</strong>
        </div>
      </section>

      <section className="rp-card rp-friends">
        <div className="rp-card-head">
          <div className="rp-card-title">
            <span>{"\u{1F465}"}</span>
            <span>Friends</span>
          </div>
          <button className="rp-link" onClick={onViewFriends}>
            View all
          </button>
        </div>

        <p className="rp-subtitle">
          {onlineCount} online · {totalFriends} friends
        </p>

        {friends.length === 0 ? (
          <div className="rp-empty">No friends yet. Add some!</div>
        ) : (
          <div className="rp-friends-list">
            {friends.slice(0, 4).map((friend) => {
              const pendingInviteId = outgoingInviteMap?.get(friend.id);
              const isInviting = invitingFriendId === friend.id;
              const isCancelling = cancellingInviteId === pendingInviteId;

              return (
                <div key={friend.id} className="rp-friend-row">
                  <div className="rp-avatar">
                    {friend.avatarUrl ? (
                      <img src={friend.avatarUrl} alt={friend.username} />
                    ) : (
                      <span>{initialsFromName(friend.username)}</span>
                    )}
                  </div>
                  <div className="rp-friend-meta">
                    <div className="rp-friend-name" title={friend.username}>
                      {friend.username}
                    </div>
                    <div className="rp-friend-status">
                      <StatusDot status={friend.status} size={8} />
                      <span>
                        {friend.status === "offline"
                          ? relativeMinutes(friend.lastSeen)
                          : STATUS_LABEL[friend.status]}
                      </span>
                    </div>
                  </div>

                  {/* Pending invite → show Cancel */}
                  {pendingInviteId ? (
                    <button
                      className="rp-cancel-btn"
                      disabled={isCancelling}
                      onClick={() => onCancelInvite?.(pendingInviteId)}
                    >
                      {isCancelling ? "…" : "Cancel"}
                    </button>
                  ) : friend.status === "online" ? (
                    <button
                      className="rp-invite-btn"
                      disabled={isInviting}
                      onClick={() => onInviteFriend(friend.id)}
                    >
                      {isInviting ? "…" : "Invite"}
                    </button>
                  ) : null}

                  {!pendingInviteId && friend.status === "matchmaking" && (
                    <span className="rp-muted-action">In Queue</span>
                  )}
                  {!pendingInviteId && friend.status === "in_game" && (
                    <span className="rp-muted-action">In Game</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <style jsx>{`
        .rp-root {
          width: 280px;
          min-width: 280px;
          height: 100%;
          display: grid;
          grid-template-rows: auto minmax(0, 1fr);
          gap: 10px;
          overflow: auto;
          padding: 10px 10px 10px 0;
        }

        .rp-card {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          padding: 12px;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          min-height: 0;
        }

        .rp-card-title {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-family: var(--font-heading);
          font-size: 0.95rem;
          font-weight: 700;
          color: #f8fafc;
        }

        .rp-card-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .rp-link {
          border: none;
          background: transparent;
          color: #a78bfa;
          font-family: var(--font-heading);
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.2s ease;
          padding: 0;
        }

        .rp-link:hover {
          opacity: 0.85;
        }

        .rp-info-row {
          margin-top: 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          color: #94a3b8;
          font-size: 0.82rem;
          font-family: var(--font-heading);
        }

        .rp-info-row strong {
          font-size: 0.95rem;
          line-height: 1;
        }

        .rp-friends {
          min-height: 0;
          display: grid;
          grid-template-rows: auto auto minmax(0, 1fr);
          gap: 7px;
        }

        .rp-subtitle {
          margin: 0;
          color: #94a3b8;
          font-family: var(--font-heading);
          font-size: 0.8rem;
        }

        .rp-empty {
          min-height: 56px;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          color: rgba(148, 163, 184, 0.9);
          font-style: italic;
          font-size: 0.8rem;
        }

        .rp-friends-list {
          min-height: 0;
          display: grid;
          grid-auto-rows: min-content;
          gap: 7px;
          overflow: auto;
          align-content: start;
          justify-items: stretch;
        }

        .rp-friend-row {
          border: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(255, 255, 255, 0.02);
          border-radius: 9px;
          padding: 7px;
          display: grid;
          grid-template-columns: 36px minmax(0, 1fr) auto;
          align-items: center;
          gap: 8px;
          transition: background 0.2s ease, border-color 0.2s ease;
        }

        .rp-friend-row:hover {
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(124, 58, 237, 0.28);
        }

        .rp-avatar {
          width: 36px;
          height: 36px;
          border-radius: 999px;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.07);
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(255, 255, 255, 0.14);
        }

        .rp-avatar :global(img) {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .rp-avatar span {
          font-family: var(--font-heading);
          font-size: 0.72rem;
          font-weight: 700;
          color: #f8fafc;
        }

        .rp-friend-meta {
          min-width: 0;
        }

        .rp-friend-name {
          font-family: var(--font-heading);
          font-size: 0.88rem;
          font-weight: 700;
          color: #f8fafc;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .rp-friend-status {
          font-family: var(--font-heading);
          font-size: 0.74rem;
          color: #94a3b8;
          margin-top: 1px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .rp-invite-btn {
          border: 1px solid rgba(124, 58, 237, 0.38);
          background: rgba(124, 58, 237, 0.16);
          color: #ddd6fe;
          border-radius: 999px;
          height: 23px;
          padding: 0 9px;
          font-family: var(--font-heading);
          font-size: 0.72rem;
          font-weight: 700;
          cursor: pointer;
          transition: background 0.2s ease, transform 0.2s ease;
        }

        .rp-invite-btn:hover {
          background: rgba(124, 58, 237, 0.3);
          transform: translateY(-1px);
        }

        .rp-invite-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }

        .rp-cancel-btn {
          border: 1px solid rgba(239, 68, 68, 0.32);
          background: rgba(239, 68, 68, 0.12);
          color: #fca5a5;
          border-radius: 999px;
          height: 23px;
          padding: 0 9px;
          font-family: var(--font-heading);
          font-size: 0.72rem;
          font-weight: 700;
          cursor: pointer;
          transition: background 0.2s ease, transform 0.2s ease;
        }

        .rp-cancel-btn:hover {
          background: rgba(239, 68, 68, 0.25);
          transform: translateY(-1px);
        }

        .rp-cancel-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }

        .rp-muted-action {
          color: #64748b;
          font-family: var(--font-heading);
          font-size: 0.74rem;
          font-weight: 700;
        }

        @media (max-width: 1024px) {
          .rp-root {
            display: none;
          }
        }
      `}</style>
    </aside>
  );
}
