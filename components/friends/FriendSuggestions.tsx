"use client";

import React from "react";
import type { FriendProfileRow } from "../../lib/friendsService";

type Suggestion = Pick<FriendProfileRow, "id" | "username" | "avatar_url" | "elo_rating">;

function initialsFromUsername(name: string): string {
  const parts = name.split(/[\s_]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return (parts[0][0] ?? "?").toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase().slice(0, 2);
}

type FriendSuggestionsProps = {
  suggestions: Suggestion[];
  loading?: boolean;
  actionLoadingId: string | null;
  onAdd: (profileId: string) => void;
  onProfileClick?: (username: string) => void;
};

export default function FriendSuggestions({
  suggestions,
  loading = false,
  actionLoadingId,
  onAdd,
  onProfileClick,
}: FriendSuggestionsProps) {
  return (
    <section className="fs-root card">
      <div className="fs-head">
        <span className="fs-title">{"\u{1F4A1}"} Suggested players</span>
        <small className="fs-sub">Similar ELO range</small>
      </div>

      {loading ? (
        <p className="fs-muted">Loading suggestions…</p>
      ) : suggestions.length === 0 ? (
        <p className="fs-muted">No suggestions right now.</p>
      ) : (
        <ul className="fs-list">
          {suggestions.map((s) => (
            <li key={s.id} className="fs-row">
              <div className={`fs-avatar${onProfileClick ? ' fs-clickable' : ''}`} aria-hidden onClick={onProfileClick ? () => onProfileClick(s.username) : undefined} title={onProfileClick ? `View ${s.username}'s profile` : undefined}>
                {s.avatar_url ? (
                  <img src={s.avatar_url} alt="" width={36} height={36} />
                ) : (
                  <span>{initialsFromUsername(s.username)}</span>
                )}
              </div>
              <div className="fs-meta">
                <div className={`fs-name${onProfileClick ? ' fs-clickable' : ''}`} onClick={onProfileClick ? () => onProfileClick(s.username) : undefined} title={onProfileClick ? `View ${s.username}'s profile` : undefined}>{s.username}</div>
                <div className="fs-elo">ELO {s.elo_rating ?? 1000}</div>
              </div>
              <button
                type="button"
                className="fs-add btn btn-secondary"
                disabled={actionLoadingId === s.id}
                onClick={() => onAdd(s.id)}
              >
                {actionLoadingId === s.id ? "…" : "Add"}
              </button>
            </li>
          ))}
        </ul>
      )}

      <style jsx>{`
        .fs-root {
          padding: 14px 16px;
        }

        .fs-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 10px;
        }

        .fs-title {
          font-family: var(--font-heading);
          font-weight: 800;
          font-size: 0.95rem;
          color: #f8fafc;
        }

        .fs-sub {
          color: rgba(148, 163, 184, 0.9);
          font-size: 0.72rem;
          font-family: var(--font-heading);
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .fs-muted {
          margin: 8px 0 0;
          text-align: center;
          color: rgba(148, 163, 184, 0.92);
          font-size: 0.85rem;
          padding: 10px 0;
        }

        .fs-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0;
        }

        .fs-row {
          display: grid;
          grid-template-columns: 36px minmax(0, 1fr) auto;
          align-items: center;
          gap: 10px;
          padding: 10px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        .fs-row:last-child {
          border-bottom: none;
        }

        .fs-avatar {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .fs-avatar :global(img) {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .fs-avatar span {
          font-family: var(--font-heading);
          font-weight: 700;
          font-size: 0.68rem;
          color: #f8fafc;
        }

        .fs-meta {
          min-width: 0;
        }

        .fs-name {
          font-family: var(--font-heading);
          font-weight: 700;
          font-size: 0.88rem;
          color: #f8fafc;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .fs-elo {
          font-size: 0.75rem;
          color: rgba(148, 163, 184, 0.95);
          margin-top: 2px;
          font-family: var(--font-heading);
          font-weight: 600;
        }

        .fs-add {
          height: 32px;
          padding: 0 12px;
          font-size: 12px;
          min-width: 72px;
        }

        .fs-clickable {
          cursor: pointer;
          transition: opacity 0.2s, transform 0.15s;
        }

        .fs-clickable:hover {
          opacity: 0.85;
        }

        .fs-avatar.fs-clickable:hover {
          transform: scale(1.08);
          border-color: rgba(167, 139, 250, 0.4);
        }

        .fs-name.fs-clickable:hover {
          color: #a78bfa;
        }
      `}</style>
    </section>
  );
}
