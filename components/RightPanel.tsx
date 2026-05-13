"use client";

import React, { useEffect, useState } from "react";
import { BellRing, UsersRound, X } from "lucide-react";
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

export type ArenaOnlineCounts = {
  totalOnline: number;
  inMatchmaking: number;
  inGame: number;
};

type RightPanelProps = {
  friends: FriendPresenceItem[];
  totalFriends: number;
  onlineCounts: ArenaOnlineCounts;
  onViewFriends: () => void;
  onInviteFriend: (friendId: string) => void;
  invitingFriendId?: string | null;
  outgoingInviteMap?: Map<string, string>;
  onCancelInvite?: (inviteId: string) => void;
  cancellingInviteId?: string | null;
  onProfileClick?: (username: string) => void;
};

type FriendsPanelCardProps = {
  friends: FriendPresenceItem[];
  totalFriends: number;
  onlineCount: number;
  limit: number;
  onViewFriends: () => void;
  onInviteFriend: (friendId: string) => void;
  invitingFriendId?: string | null;
  outgoingInviteMap?: Map<string, string>;
  onCancelInvite?: (inviteId: string) => void;
  cancellingInviteId?: string | null;
  onProfileClick?: (username: string) => void;
  fill?: boolean;
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

function formatLastSeen(value?: string | null): string {
  if (!value) return "Last seen recently";

  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return "Last seen recently";

  const diffMs = Date.now() - ts;
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  if (days < 7) return `${days}d ago`;
  if (weeks < 4) return `${weeks}w ago`;

  return `${months <= 0 ? 1 : months} ${months <= 1 ? "month" : "months"} ago`;
}

export default function RightPanel({
  friends,
  totalFriends,
  onlineCounts,
  onViewFriends,
  onInviteFriend,
  invitingFriendId,
  outgoingInviteMap,
  onCancelInvite,
  cancellingInviteId,
  onProfileClick,
}: RightPanelProps) {
  const onlineCount = friends.filter((friend) => friend.status !== "offline").length;
  const [mobileFriendsOpen, setMobileFriendsOpen] = useState(false);
  const [, setTimeTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeTick((value) => value + 1);
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!mobileFriendsOpen) return;

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileFriendsOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  }, [mobileFriendsOpen]);

  const handleViewFriends = () => {
    setMobileFriendsOpen(false);
    onViewFriends();
  };

  const handleProfileClick = (username: string) => {
    setMobileFriendsOpen(false);
    onProfileClick?.(username);
  };

  const friendsPanelProps = {
    friends,
    totalFriends,
    onlineCount,
    onViewFriends: handleViewFriends,
    onInviteFriend,
    invitingFriendId,
    outgoingInviteMap,
    onCancelInvite,
    cancellingInviteId,
    onProfileClick: onProfileClick ? handleProfileClick : undefined,
  };

  return (
    <>
      <aside className="rp-root">
        <ArenaStatusCard onlineCounts={onlineCounts} />
        <FriendsPanelCard {...friendsPanelProps} limit={4} />
      </aside>

      <button
        type="button"
        className="rp-mobile-tab"
        aria-label={`Open friends panel, ${onlineCount} online`}
        aria-expanded={mobileFriendsOpen}
        aria-controls="mobile-friends-panel"
        onClick={() => setMobileFriendsOpen(true)}
      >
        <UsersRound size={18} strokeWidth={2.35} aria-hidden="true" />
        <span className="rp-mobile-tab-count">{onlineCount}</span>
      </button>

      {mobileFriendsOpen && (
        <div className="rp-mobile-layer">
          <button
            type="button"
            className="rp-mobile-backdrop"
            aria-label="Close friends panel"
            onClick={() => setMobileFriendsOpen(false)}
          />
          <aside
            id="mobile-friends-panel"
            className="rp-mobile-drawer"
            aria-label="Friends panel"
          >
            <div className="rp-mobile-drawer-head">
              <span>Friends</span>
              <button
                type="button"
                className="rp-mobile-close"
                aria-label="Close friends panel"
                onClick={() => setMobileFriendsOpen(false)}
              >
                <X size={18} strokeWidth={2.35} aria-hidden="true" />
              </button>
            </div>
            <FriendsPanelCard
              {...friendsPanelProps}
              limit={Math.max(friends.length, 4)}
              fill
            />
          </aside>
        </div>
      )}

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

        .rp-mobile-tab,
        .rp-mobile-layer {
          display: none;
        }

        @media (max-width: 1024px) {
          .rp-root {
            display: none;
          }

          .rp-mobile-tab {
            position: fixed;
            top: 48%;
            right: 0;
            z-index: 90;
            width: 42px;
            height: 86px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-right: none;
            border-radius: 14px 0 0 14px;
            background: rgba(13, 21, 38, 0.94);
            color: #e9d5ff;
            box-shadow: -8px 14px 28px rgba(0, 0, 0, 0.28);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            display: inline-flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 7px;
            cursor: pointer;
            transform: translateY(-50%);
          }

          .rp-mobile-tab-count {
            min-width: 18px;
            height: 18px;
            border-radius: 999px;
            padding: 0 5px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            background: rgba(16, 185, 129, 0.18);
            color: #34d399;
            font-family: var(--font-heading);
            font-size: 0.7rem;
            font-weight: 800;
            line-height: 1;
          }

          .rp-mobile-layer {
            position: fixed;
            inset: 0;
            z-index: 260;
            display: block;
          }

          .rp-mobile-backdrop {
            position: absolute;
            inset: 0;
            border: none;
            background: rgba(0, 0, 0, 0.34);
            cursor: pointer;
          }

          .rp-mobile-drawer {
            position: absolute;
            top: 0;
            right: 0;
            bottom: 0;
            width: min(332px, calc(100vw - 42px));
            padding: 12px 12px 84px;
            border-left: 1px solid rgba(255, 255, 255, 0.1);
            background: rgba(10, 15, 30, 0.98);
            box-shadow: -18px 0 44px rgba(0, 0, 0, 0.42);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            display: grid;
            grid-template-rows: auto minmax(0, 1fr);
            gap: 10px;
            overflow: hidden;
            animation: rp-slide-in 0.2s ease-out forwards;
          }

          .rp-mobile-drawer-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            min-height: 38px;
            color: #f8fafc;
            font-family: var(--font-heading);
            font-size: 1.05rem;
            font-weight: 800;
          }

          .rp-mobile-close {
            width: 34px;
            height: 34px;
            border-radius: 9px;
            border: 1px solid rgba(255, 255, 255, 0.08);
            background: rgba(255, 255, 255, 0.04);
            color: #e2e8f0;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
          }
        }

        @keyframes rp-slide-in {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
      `}</style>
    </>
  );
}

function FriendsPanelCard({
  friends,
  totalFriends,
  onlineCount,
  limit,
  onViewFriends,
  onInviteFriend,
  invitingFriendId,
  outgoingInviteMap,
  onCancelInvite,
  cancellingInviteId,
  onProfileClick,
  fill = false,
}: FriendsPanelCardProps) {
  const visibleFriends = friends.slice(0, limit);

  return (
    <section className={`rp-card rp-friends${fill ? " is-fill" : ""}`}>
      <div className="rp-card-head">
        <div className="rp-card-title">
          <span className="rp-title-icon">
            <UsersRound size={15} strokeWidth={2.35} aria-hidden="true" />
          </span>
          <span>Friends</span>
        </div>
        <button className="rp-link" onClick={onViewFriends}>
          View all
        </button>
      </div>

      <p className="rp-subtitle">
        {onlineCount} online / {totalFriends} friends
      </p>

      {friends.length === 0 ? (
        <div className="rp-empty">No friends yet. Add some!</div>
      ) : (
        <div className="rp-friends-list">
          {visibleFriends.map((friend) => {
            const pendingInviteId = outgoingInviteMap?.get(friend.id);
            const isInviting = invitingFriendId === friend.id;
            const isCancelling = cancellingInviteId === pendingInviteId;

            return (
              <div key={friend.id} className="rp-friend-row">
                <div
                  className={`rp-avatar${onProfileClick ? " rp-clickable" : ""}`}
                  onClick={onProfileClick ? () => onProfileClick(friend.username) : undefined}
                  title={onProfileClick ? `View ${friend.username}'s profile` : undefined}
                >
                  {friend.avatarUrl ? (
                    <img src={friend.avatarUrl} alt={friend.username} />
                  ) : (
                    <span>{initialsFromName(friend.username)}</span>
                  )}
                </div>
                <div className="rp-friend-meta">
                  <div
                    className={`rp-friend-name${onProfileClick ? " rp-clickable" : ""}`}
                    title={onProfileClick ? `View ${friend.username}'s profile` : friend.username}
                    onClick={onProfileClick ? () => onProfileClick(friend.username) : undefined}
                  >
                    {friend.username}
                  </div>
                  <div className="rp-friend-status">
                    <StatusDot status={friend.status} size={8} />
                    <span>
                      {friend.status === "offline"
                        ? formatLastSeen(friend.lastSeen)
                        : STATUS_LABEL[friend.status]}
                    </span>
                  </div>
                </div>

                {pendingInviteId ? (
                  <button
                    className="rp-cancel-btn"
                    disabled={isCancelling}
                    onClick={() => onCancelInvite?.(pendingInviteId)}
                  >
                    {isCancelling ? "..." : "Cancel"}
                  </button>
                ) : friend.status === "online" ? (
                  <button
                    className="rp-invite-btn"
                    disabled={isInviting}
                    onClick={() => onInviteFriend(friend.id)}
                  >
                    {isInviting ? "..." : "Invite"}
                  </button>
                ) : null}

                {!pendingInviteId && friend.status === "matchmaking" && (
                  <span className="rp-muted-action">In Queue</span>
                )}
                {!pendingInviteId && friend.status === "in_room" && (
                  <span className="rp-muted-action">In Room</span>
                )}
                {!pendingInviteId && friend.status === "in_game" && (
                  <span className="rp-muted-action">In Game</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <style jsx>{`
        .rp-card {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          padding: 12px;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          min-height: 0;
        }

        .rp-friends {
          display: grid;
          grid-template-rows: auto auto minmax(0, 1fr);
          gap: 7px;
        }

        .is-fill {
          height: 100%;
        }

        .rp-card-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
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

        .rp-title-icon {
          width: 20px;
          height: 20px;
          border-radius: 6px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          color: #c4b5fd;
          background: rgba(124, 58, 237, 0.16);
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

        .rp-clickable {
          cursor: pointer;
          transition: opacity 0.2s, transform 0.15s;
        }

        .rp-clickable:hover {
          opacity: 0.85;
        }

        .rp-avatar.rp-clickable:hover {
          transform: scale(1.08);
          border-color: rgba(167, 139, 250, 0.4);
        }

        .rp-friend-name.rp-clickable:hover {
          color: #a78bfa;
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

        .rp-invite-btn,
        .rp-cancel-btn {
          border-radius: 999px;
          height: 23px;
          padding: 0 9px;
          font-family: var(--font-heading);
          font-size: 0.72rem;
          font-weight: 700;
          cursor: pointer;
          transition: background 0.2s ease, transform 0.2s ease;
        }

        .rp-invite-btn {
          border: 1px solid rgba(124, 58, 237, 0.38);
          background: rgba(124, 58, 237, 0.16);
          color: #ddd6fe;
        }

        .rp-invite-btn:hover {
          background: rgba(124, 58, 237, 0.3);
          transform: translateY(-1px);
        }

        .rp-cancel-btn {
          border: 1px solid rgba(239, 68, 68, 0.32);
          background: rgba(239, 68, 68, 0.12);
          color: #fca5a5;
        }

        .rp-cancel-btn:hover {
          background: rgba(239, 68, 68, 0.25);
          transform: translateY(-1px);
        }

        .rp-invite-btn:disabled,
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
      `}</style>
    </section>
  );
}

export function ArenaStatusCard({
  onlineCounts,
  compact = false,
  className,
}: {
  onlineCounts: ArenaOnlineCounts;
  compact?: boolean;
  className?: string;
}) {
  const classes = [
    "rp-card",
    "rp-arena-status-card",
    compact ? "is-compact" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={classes}>
      <div className="rp-card-title">
        <span className="rp-title-icon">
          <BellRing size={15} strokeWidth={2.35} aria-hidden="true" />
        </span>
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
        <span>In Match</span>
        <strong style={{ color: "#ef4444" }}>{onlineCounts.inGame}</strong>
      </div>

      <style jsx>{`
        .rp-card {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          padding: 12px;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          min-height: 0;
        }

        .rp-arena-status-card {
          min-width: 0;
        }

        .rp-card-title {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-family: var(--font-heading);
          font-size: 0.95rem;
          font-weight: 700;
          color: #f8fafc;
          max-width: 100%;
        }

        .rp-title-icon {
          width: 20px;
          height: 20px;
          border-radius: 6px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          color: #c4b5fd;
          background: rgba(124, 58, 237, 0.16);
        }

        .rp-info-row {
          margin-top: 10px;
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          gap: 8px;
          color: #94a3b8;
          font-size: 0.82rem;
          font-family: var(--font-heading);
        }

        .rp-info-row span {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .rp-info-row strong {
          font-size: 0.95rem;
          line-height: 1;
        }

        .is-compact {
          width: 100%;
          padding: 8px 9px;
          border-radius: 10px;
        }

        .is-compact .rp-card-title {
          gap: 5px;
          font-size: 0.72rem;
          line-height: 1;
          white-space: nowrap;
        }

        .is-compact .rp-title-icon {
          width: 17px;
          height: 17px;
          border-radius: 5px;
        }

        .is-compact .rp-info-row {
          margin-top: 6px;
          font-size: 0.68rem;
          gap: 6px;
        }

        .is-compact .rp-info-row strong {
          font-size: 0.82rem;
        }
      `}</style>
    </section>
  );
}
