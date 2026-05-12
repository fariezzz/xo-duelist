"use client";

import React from "react";
import type { UserStatus } from "../../lib/statusUtils";
import { formatRelativeLastSeen } from "../../lib/relativeTime";
import TierBadge from "../TierBadge";

export type FriendRowProfile = {
  id: string;
  username: string;
  avatar_url: string | null;
  elo_rating: number;
};

function initialsFromUsername(name: string): string {
  const parts = name.split(/[\s_]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return (parts[0][0] ?? "?").toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase().slice(0, 2);
}

function statusDisplay(status: UserStatus): { label: string; color: string } {
  switch (status) {
    case "online":
      return { label: "Online", color: "#34d399" };
    case "in_room":
      return { label: "In room", color: "#38bdf8" };
    case "matchmaking":
      return { label: "Searching for opponent", color: "#fbbf24" };
    case "in_game":
      return { label: "In match", color: "#f87171" };
    default:
      return { label: "Offline", color: "#94a3b8" };
  }
}

function inviteTooltip(status: UserStatus, pendingInvite: boolean): string | undefined {
  if (pendingInvite) return "Match invite already sent";
  if (status === "offline") return "Player is offline";
  if (status === "in_room") return "Player is in a waiting room";
  if (status === "in_game") return "Currently in a match";
  if (status === "matchmaking") return "Searching for an opponent";
  return undefined;
}

export type FriendRowProps = {
  profile: FriendRowProfile;
  status: UserStatus;
  lastSeen: string | null;
  pendingOutgoingInvite?: boolean;
  inviteLoading?: boolean;
  onProfile: () => void;
  onInvite: () => void;
  onRemove: () => void;
};

export function FriendRow({
  profile,
  status,
  lastSeen,
  pendingOutgoingInvite = false,
  inviteLoading = false,
  onProfile,
  onInvite,
  onRemove,
}: FriendRowProps) {
  const sd = statusDisplay(status);
  const canInvite = status === "online" && !pendingOutgoingInvite;
  const disabledInvite = !canInvite || inviteLoading;
  const tip = inviteTooltip(status, pendingOutgoingInvite);

  const metaParts: string[] = [];
  if (status === "offline") {
    metaParts.push(formatRelativeLastSeen(lastSeen));
  }
  metaParts.push(`ELO ${profile.elo_rating ?? 1000}`);

  return (
    <div className="fr-row">
      <div className="fr-avatar fr-clickable" aria-hidden onClick={onProfile} title={`View ${profile.username}'s profile`}>
        {profile.avatar_url ? (
          <img src={profile.avatar_url} alt="" width={40} height={40} />
        ) : (
          <span>{initialsFromUsername(profile.username)}</span>
        )}
      </div>

      <div className="fr-main">
        <div className="fr-name fr-clickable" onClick={onProfile} title={`View ${profile.username}'s profile`}>{profile.username}</div>
        <div className="fr-meta">
          <span className="fr-dot" style={{ background: sd.color }} title={sd.label} />
          <span className="fr-status-label" style={{ color: sd.color }}>
            {sd.label}
          </span>
          <span className="fr-sep">•</span>
          <span className="fr-rest">{metaParts.join(" • ")}</span>
        </div>
      </div>

      <div className="fr-actions">
        <button type="button" className="fr-btn fr-btn-ghost" onClick={onProfile}>
          Profile
        </button>
        <button
          type="button"
          className="fr-btn fr-btn-primary"
          disabled={disabledInvite}
          title={disabledInvite ? tip : undefined}
          onClick={onInvite}
        >
          {inviteLoading ? "…" : pendingOutgoingInvite ? "Sent" : "Invite"}
        </button>
        <button type="button" className="fr-btn fr-btn-danger" onClick={onRemove}>
          Remove
        </button>
      </div>

      <style jsx>{`
        .fr-row {
          display: grid;
          grid-template-columns: 40px minmax(0, 1fr) auto;
          align-items: center;
          gap: 12px 14px;
          min-height: 64px;
          max-height: 64px;
          padding: 12px 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          transition: background 0.2s ease;
        }

        .fr-row:hover {
          background: rgba(255, 255, 255, 0.03);
        }

        .fr-row:last-child {
          border-bottom: none;
        }

        .fr-avatar {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          overflow: hidden;
          flex-shrink: 0;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .fr-avatar :global(img) {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .fr-avatar span {
          font-family: var(--font-heading);
          font-weight: 700;
          font-size: 0.75rem;
          color: #f8fafc;
        }

        .fr-clickable {
          cursor: pointer;
          transition: opacity 0.2s, transform 0.15s;
        }

        .fr-clickable:hover {
          opacity: 0.85;
        }

        .fr-avatar.fr-clickable:hover {
          transform: scale(1.08);
          border-color: rgba(167, 139, 250, 0.4);
        }

        .fr-name.fr-clickable:hover {
          color: #a78bfa;
        }

        .fr-main {
          min-width: 0;
        }

        .fr-name {
          font-size: 14px;
          font-weight: 700;
          color: #f8fafc;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          line-height: 1.2;
        }

        .fr-meta {
          margin-top: 4px;
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
          font-size: 12px;
          color: rgba(148, 163, 184, 0.95);
          line-height: 1.2;
          min-width: 0;
        }

        .fr-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .fr-status-label {
          font-weight: 600;
          white-space: nowrap;
          margin-left: 2px;
        }

        .fr-sep {
          opacity: 0.5;
        }

        .fr-rest {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .fr-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }

        .fr-btn {
          height: 32px;
          padding: 0 12px;
          font-size: 12px;
          font-family: var(--font-heading);
          font-weight: 600;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.2s ease;
          border: 1px solid transparent;
          white-space: nowrap;
        }

        .fr-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .fr-btn-ghost {
          background: transparent;
          border-color: rgba(255, 255, 255, 0.14);
          color: #e2e8f0;
        }

        .fr-btn-ghost:hover:not(:disabled) {
          border-color: rgba(167, 139, 250, 0.45);
          color: #fff;
        }

        .fr-btn-primary {
          background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%);
          color: white;
          box-shadow: 0 2px 12px rgba(124, 58, 237, 0.28);
          border: none;
        }

        .fr-btn-primary:hover:not(:disabled) {
          box-shadow: 0 4px 18px rgba(124, 58, 237, 0.4);
        }

        .fr-btn-danger {
          background: transparent;
          border: 1px solid rgba(239, 68, 68, 0.35);
          color: #fca5a5;
        }

        .fr-btn-danger:hover:not(:disabled) {
          background: rgba(239, 68, 68, 0.12);
          border-color: rgba(239, 68, 68, 0.55);
        }

        @media (max-width: 900px) {
          .fr-row {
            grid-template-columns: 40px minmax(0, 1fr);
            max-height: none;
            min-height: 0;
            padding-bottom: 14px;
          }

          .fr-actions {
            grid-column: 1 / -1;
            justify-content: flex-end;
            flex-wrap: wrap;
          }
        }
      `}</style>
    </div>
  );
}

export type SearchPlayerRowProfile = FriendRowProfile;

export type SearchPlayerRowProps = {
  profile: SearchPlayerRowProfile;
  right: React.ReactNode;
  onProfile?: () => void;
};

export function SearchPlayerRow({ profile, right, onProfile }: SearchPlayerRowProps) {
  return (
    <div className="spr-row">
      <div className={`spr-avatar${onProfile ? ' spr-clickable' : ''}`} aria-hidden onClick={onProfile} title={onProfile ? `View ${profile.username}'s profile` : undefined}>
        {profile.avatar_url ? (
          <img src={profile.avatar_url} alt="" width={40} height={40} />
        ) : (
          <span>{initialsFromUsername(profile.username)}</span>
        )}
      </div>
      <div className="spr-main">
        <div className={`spr-name${onProfile ? ' spr-clickable' : ''}`} onClick={onProfile} title={onProfile ? `View ${profile.username}'s profile` : undefined}>{profile.username}</div>
        <div className="spr-sub">
          <TierBadge elo={profile.elo_rating ?? 1000} />
          <span className="spr-elo">ELO {profile.elo_rating ?? 1000}</span>
        </div>
      </div>
      <div className="spr-right">{right}</div>

      <style jsx>{`
        .spr-row {
          display: grid;
          grid-template-columns: 40px minmax(0, 1fr) auto;
          align-items: center;
          gap: 12px 14px;
          min-height: 64px;
          max-height: 64px;
          padding: 12px 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          transition: background 0.2s ease;
        }

        .spr-row:hover {
          background: rgba(255, 255, 255, 0.03);
        }

        .spr-row:last-child {
          border-bottom: none;
        }

        .spr-avatar {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .spr-avatar :global(img) {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .spr-avatar span {
          font-family: var(--font-heading);
          font-weight: 700;
          font-size: 0.75rem;
          color: #f8fafc;
        }

        .spr-main {
          min-width: 0;
        }

        .spr-name {
          font-size: 14px;
          font-weight: 700;
          color: #f8fafc;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .spr-sub {
          margin-top: 4px;
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .spr-elo {
          font-size: 12px;
          color: rgba(148, 163, 184, 0.95);
          font-family: var(--font-heading);
          font-weight: 600;
        }

        .spr-clickable {
          cursor: pointer;
          transition: opacity 0.2s, transform 0.15s;
        }

        .spr-clickable:hover {
          opacity: 0.85;
        }

        .spr-avatar.spr-clickable:hover {
          transform: scale(1.08);
          border-color: rgba(167, 139, 250, 0.4);
        }

        .spr-name.spr-clickable:hover {
          color: #a78bfa;
        }

        .spr-right {
          flex-shrink: 0;
        }

        @media (max-width: 640px) {
          .spr-row {
            grid-template-columns: 40px minmax(0, 1fr);
            max-height: none;
          }

          .spr-right {
            grid-column: 1 / -1;
            justify-self: end;
          }
        }
      `}</style>
    </div>
  );
}
