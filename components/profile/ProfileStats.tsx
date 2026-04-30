"use client";
import React from "react";
import TierBadge from "../TierBadge";
import type { ProfileData } from "../../hooks/useProfile";

interface Props {
  profile: ProfileData;
}

export default function ProfileStats({ profile }: Props) {
  const totalGames = profile.wins + profile.losses + profile.draws;
  const winrate = totalGames > 0 ? Math.round((profile.wins / totalGames) * 100) : 0;
  const memberSince = new Date(profile.created_at).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const stats = [
    { label: "Wins", value: profile.wins, color: "#10b981" },
    { label: "Losses", value: profile.losses, color: "#ef4444" },
    { label: "Draws", value: profile.draws, color: "#f59e0b" },
    { label: "Winrate", value: `${winrate}%`, color: "#a78bfa" },
  ];

  return (
    <div className="card" style={{ padding: "24px" }}>
      {/* ELO + Tier */}
      <div style={{ textAlign: "center", marginBottom: "20px" }}>
        <div
          style={{
            fontFamily: "var(--font-heading)",
            fontWeight: 700,
            fontSize: "2.5rem",
            color: "#fbbf24",
            textShadow: "0 0 30px rgba(245,158,11,0.3)",
            lineHeight: 1,
            marginBottom: "8px",
          }}
        >
          {profile.elo_rating}
        </div>
        <div style={{ marginBottom: "8px" }}>
          <TierBadge elo={profile.elo_rating} />
        </div>
        {profile.rank && (
          <div
            style={{
              fontFamily: "var(--font-heading)",
              fontWeight: 600,
              fontSize: "0.85rem",
              color: "var(--text-muted)",
            }}
          >
            Rank <span style={{ color: "#a78bfa" }}>#{profile.rank}</span> of {profile.totalPlayers}
          </div>
        )}
      </div>

      {/* Stats Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "16px" }}>
        {stats.map((s) => (
          <div
            key={s.label}
            style={{
              padding: "12px",
              borderRadius: "12px",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-heading)",
                fontWeight: 700,
                fontSize: "1.3rem",
                color: s.color,
                marginBottom: "2px",
              }}
            >
              {s.value}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "var(--font-heading)", fontWeight: 500 }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* Total Games */}
      <div
        style={{
          textAlign: "center",
          padding: "10px",
          borderRadius: "10px",
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.05)",
          marginBottom: "12px",
        }}
      >
        <span style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: "0.85rem", color: "var(--text-muted)" }}>
          Total Games: <span style={{ color: "var(--text-primary)" }}>{totalGames}</span>
        </span>
      </div>

      {/* Member Since */}
      <div style={{ textAlign: "center", fontSize: "0.8rem", color: "var(--text-muted)", fontFamily: "var(--font-heading)" }}>
        Member since {memberSince}
      </div>
    </div>
  );
}
