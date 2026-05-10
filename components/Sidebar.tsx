"use client";

import React from "react";
import type { UserStatus } from "../lib/statusUtils";
import UserStatusBadge from "./ui/UserStatusBadge";

export type SidebarNavKey = "vs_ai" | "training" | "lobby" | "friends" | "history" | "leaderboard";

type SidebarProps = {
  activeNav: SidebarNavKey | null;
  pendingFriendRequests: number;
  username: string;
  avatarUrl: string | null;
  onNavigate: (key: SidebarNavKey) => void;
  onOpenProfile: () => void;
  onSignOut: () => void;
  userStatus: UserStatus;
  onToggleStatus: () => void;
};

const NAV_ITEMS: Array<{ key: SidebarNavKey; label: string; icon: string; section: "play" | "social" }> = [
  { key: "vs_ai", label: "VS AI", icon: "\u{1F916}", section: "play" },
  { key: "training", label: "Training", icon: "\u{1F3AF}", section: "play" },
  { key: "lobby", label: "Lobby", icon: "\u{1F3E0}", section: "play" },
  { key: "friends", label: "Friends", icon: "\u{1F465}", section: "social" },
  { key: "leaderboard", label: "Leaderboard", icon: "\u{1F3C6}", section: "social" },
  { key: "history", label: "History", icon: "\u{1F4DC}", section: "social" },
];

function getInitials(username: string): string {
  const initials = username
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return initials || "?";
}

export default function Sidebar({
  activeNav,
  pendingFriendRequests,
  username,
  avatarUrl,
  onNavigate,
  onOpenProfile,
  onSignOut,
  userStatus,
  onToggleStatus,
}: SidebarProps) {
  const playItems = NAV_ITEMS.filter((item) => item.section === "play");
  const socialItems = NAV_ITEMS.filter((item) => item.section === "social");

  return (
    <aside className="sb-root">
      <div className="sb-brand">
        <div className="sb-logo-line">
          <span className="sb-logo-x">X</span>
          <span className="sb-logo-o">O</span>
          <span className="sb-logo-text">Duelist</span>
        </div>
        <p className="sb-subtitle">Competitive Arena</p>
      </div>

      <nav className="sb-nav">
        <section className="sb-group">
          <div className="sb-group-label">Play</div>
          {playItems.map((item) => (
            <button
              key={item.key}
              className={`sb-item ${activeNav === item.key ? "is-active" : ""}`}
              onClick={() => onNavigate(item.key)}
              title={item.label}
            >
              <span className="sb-item-icon">{item.icon}</span>
              <span className="sb-item-label">{item.label}</span>
              <span className="sb-item-dot" />
            </button>
          ))}
        </section>

        <section className="sb-group">
          <div className="sb-group-label">Social</div>
          {socialItems.map((item) => (
            <button
              key={item.key}
              className={`sb-item ${activeNav === item.key ? "is-active" : ""}`}
              onClick={() => onNavigate(item.key)}
              title={item.label}
            >
              <span className="sb-item-icon">{item.icon}</span>
              <span className="sb-item-label">{item.label}</span>
              {item.key === "friends" && pendingFriendRequests > 0 && (
                <span className="sb-item-badge">{pendingFriendRequests > 9 ? "9+" : pendingFriendRequests}</span>
              )}
              <span className="sb-item-dot" />
            </button>
          ))}
        </section>
      </nav>

      <div className="sb-bottom">
        <button className="sb-profile" onClick={onOpenProfile} title="Open profile">
          <div className="sb-profile-avatar">
            {avatarUrl ? <img src={avatarUrl} alt={username} /> : <span>{getInitials(username)}</span>}
          </div>
          <div className="sb-profile-meta">
            <span className="sb-profile-label">Profile</span>
            <span className="sb-profile-name">{username}</span>
          </div>
        </button>
        <button className="sb-status" onClick={onToggleStatus} title="Toggle online/offline">
          <span className="sb-status-label">Status</span>
          <UserStatusBadge status={userStatus} />
        </button>

        <button className="sb-signout" onClick={onSignOut}>
          <span className="sb-signout-icon">{"\u{1F6AA}"}</span>
          <span className="sb-signout-text">Sign Out</span>
        </button>
      </div>

      <style jsx>{`
        .sb-root {
          width: 220px;
          min-width: 220px;
          height: 100%;
          background: #0d1526;
          border-right: 1px solid rgba(255, 255, 255, 0.08);
          padding: 12px 10px;
          display: grid;
          grid-template-rows: auto 1fr auto;
          gap: 10px;
        }

        .sb-brand {
          padding: 8px 8px 4px;
        }

        .sb-logo-line {
          display: flex;
          align-items: center;
          gap: 3px;
          font-family: var(--font-heading);
          font-weight: 700;
          line-height: 1;
        }

        .sb-logo-x {
          font-size: 1.56rem;
          color: #7c3aed;
        }

        .sb-logo-o {
          font-size: 1.56rem;
          color: #f59e0b;
        }

        .sb-logo-text {
          margin-left: 6px;
          font-size: 1.45rem;
          color: #f8fafc;
        }

        .sb-subtitle {
          margin: 6px 0 0;
          color: #94a3b8;
          font-size: 0.73rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          font-family: var(--font-heading);
        }

        .sb-nav {
          min-height: 0;
          overflow: auto;
          padding: 2px 0;
          display: grid;
          gap: 12px;
          align-content: start;
        }

        .sb-group {
          display: grid;
          gap: 8px;
          align-content: start;
        }

        .sb-group-label {
          color: #94a3b8;
          font-family: var(--font-heading);
          font-size: 0.64rem;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          padding: 0 10px 2px;
          text-align: left;
        }

        .sb-item {
          width: 100%;
          min-height: 42px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-left: 3px solid transparent;
          background: rgba(255, 255, 255, 0.02);
          color: #cbd5e1;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0 11px;
          justify-content: flex-start;
          cursor: pointer;
          transition: all 0.15s ease;
          text-align: left;
        }

        .sb-item:hover {
          background: rgba(124, 58, 237, 0.12);
          color: #f8fafc;
        }

        .sb-item.is-active {
          background: rgba(124, 58, 237, 0.2);
          border-left-color: #7c3aed;
          color: #ffffff;
          font-weight: 700;
        }

        .sb-item-icon {
          width: 20px;
          font-size: 0.92rem;
          line-height: 1;
          text-align: center;
          flex-shrink: 0;
        }

        .sb-item-label {
          flex: 1;
          font-family: var(--font-heading);
          font-size: 0.8rem;
          letter-spacing: 0.01em;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          text-align: left;
        }

        .sb-item-badge {
          margin-left: auto;
          min-width: 18px;
          height: 18px;
          border-radius: 999px;
          background: #ef4444;
          color: #fff;
          font-family: var(--font-heading);
          font-size: 0.72rem;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0 5px;
          line-height: 1;
          box-shadow: 0 0 0 2px rgba(13, 21, 38, 0.95);
        }

        .sb-item-dot {
          margin-left: 8px;
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: transparent;
          transition: background 0.15s ease;
          flex-shrink: 0;
        }

        .sb-item.is-active .sb-item-dot {
          background: #a78bfa;
        }

        .sb-bottom {
          display: grid;
          gap: 8px;
        }

        .sb-profile {
          border-radius: 9px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.02);
          padding: 8px 10px;
          cursor: pointer;
          transition: background 0.15s ease;
          display: grid;
          grid-template-columns: 34px 1fr;
          align-items: center;
          gap: 8px;
          text-align: left;
        }

        .sb-profile:hover {
          background: rgba(255, 255, 255, 0.05);
        }

        .sb-profile-avatar {
          width: 34px;
          height: 34px;
          border-radius: 999px;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.08);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .sb-profile-avatar :global(img) {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .sb-profile-avatar span {
          color: #f8fafc;
          font-family: var(--font-heading);
          font-size: 0.75rem;
          font-weight: 700;
        }

        .sb-profile-meta {
          min-width: 0;
          display: grid;
          gap: 2px;
        }

        .sb-profile-label {
          color: #94a3b8;
          font-family: var(--font-heading);
          font-size: 0.62rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          line-height: 1;
        }

        .sb-profile-name {
          color: #f8fafc;
          font-family: var(--font-heading);
          font-size: 0.8rem;
          font-weight: 700;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          line-height: 1.1;
        }

        .sb-signout {
          border: none;
          background: transparent;
          color: rgba(248, 113, 113, 0.85);
          padding: 6px 3px;
          display: inline-flex;
          align-items: center;
          justify-content: flex-start;
          gap: 7px;
          font-family: var(--font-heading);
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          transition: color 0.15s ease, opacity 0.15s ease;
          opacity: 0.86;
        }

        .sb-status {
          border-radius: 9px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.02);
          min-height: 42px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 10px;
          cursor: pointer;
        }

        .sb-status-label {
          color: #94a3b8;
          font-family: var(--font-heading);
          font-size: 0.72rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .sb-signout:hover {
          opacity: 1;
          color: #f87171;
        }

        .sb-signout-icon {
          font-size: 0.95rem;
        }

        @media (max-width: 1024px) {
          .sb-root {
            width: 48px;
            min-width: 48px;
            padding: 10px 6px;
          }

          .sb-logo-text,
          .sb-subtitle,
          .sb-group-label,
          .sb-item-label,
          .sb-item-badge,
          .sb-profile-meta,
          .sb-signout-text {
            display: none;
          }

          .sb-logo-line {
            justify-content: center;
          }

          .sb-logo-x,
          .sb-logo-o {
            font-size: 1.32rem;
          }

          .sb-item {
            justify-content: center;
            padding: 0;
            border-left-width: 1px;
          }

          .sb-item-dot {
            display: none;
          }

          .sb-profile {
            grid-template-columns: 1fr;
            justify-items: center;
            padding: 8px 0;
          }

          .sb-signout {
            justify-content: center;
            padding: 8px 0;
          }
        }

        @media (max-width: 768px) {
          .sb-root {
            width: 100%;
            min-width: 0;
            height: 64px;
            padding: 7px 8px;
            border-right: none;
            border-top: 1px solid rgba(255, 255, 255, 0.08);
            background: rgba(13, 21, 38, 0.97);
            grid-template-rows: 1fr;
            position: fixed;
            bottom: 0;
            left: 0;
            z-index: 50;
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
          }


          .sb-brand,
          .sb-bottom {
            display: none;
          }

          .sb-nav {
            overflow-x: auto;
            overflow-y: hidden;
            display: flex;
            align-items: center;
            gap: 8px;
            scrollbar-width: none;
          }

          .sb-group {
            display: flex;
            gap: 8px;
          }

          .sb-item {
            min-height: 48px;
            min-width: 50px;
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-bottom: 3px solid transparent;
            padding: 0;
            justify-content: center;
          }

          .sb-item.is-active {
            border-left-color: rgba(255, 255, 255, 0.08);
            border-bottom-color: #7c3aed;
            background: rgba(124, 58, 237, 0.2);
          }
        }
      `}</style>
    </aside>
  );
}
