"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  Check,
  CircleAlert,
  Eye,
  Link2,
  ShieldAlert,
  Trash2,
  User,
} from "lucide-react";
import Navbar from "../../components/Navbar";
import AvatarUpload from "../../components/profile/AvatarUpload";
import ProfileStats from "../../components/profile/ProfileStats";
import ProfileForm from "../../components/profile/ProfileForm";
import ChangePasswordForm from "../../components/profile/ChangePasswordForm";
import DangerZone from "../../components/profile/DangerZone";
import TierBadge from "../../components/TierBadge";
import { useProfile } from "../../hooks/useProfile";

/* ── ELO tier helpers ─────────────────────────────────── */
interface Tier {
  name: string;
  min: number;
  max: number;
  color: string;
}

const ELO_TIERS: Tier[] = [
  { name: "Bronze", min: 0, max: 799, color: "#b45309" },
  { name: "Silver", min: 800, max: 1199, color: "#9ca3af" },
  { name: "Gold", min: 1200, max: 1599, color: "#f59e0b" },
  { name: "Platinum", min: 1600, max: 1999, color: "#38bdf8" },
  { name: "Diamond", min: 2000, max: 9999, color: "#a78bfa" },
];

function getEloTier(elo: number): { current: Tier; next: Tier | null; pct: number } {
  let idx = 0;
  for (let i = ELO_TIERS.length - 1; i >= 0; i--) {
    if (elo >= ELO_TIERS[i].min) { idx = i; break; }
  }
  const current = ELO_TIERS[idx];
  const next = idx < ELO_TIERS.length - 1 ? ELO_TIERS[idx + 1] : null;
  const pct = next
    ? Math.min(100, Math.max(0, ((elo - current.min) / (next.min - current.min)) * 100))
    : 100;
  return { current, next, pct };
}

export default function ProfilePage() {
  const router = useRouter();
  const {
    profile, loading, saving, error,
    usernameCheck, checkUsername,
    updateProfile, updateEmail, linkProvider, unlinkProvider, createPassword, updatePassword,
    uploadAvatar, removeAvatar, deleteAccount,
  } = useProfile();

  const [isDirty, setIsDirty] = useState(false);
  const dirtyRef = useRef(false);
  const [copied, setCopied] = useState(false);

  // Keep ref in sync for beforeunload
  useEffect(() => { dirtyRef.current = isDirty; }, [isDirty]);

  // Warn on navigation with unsaved changes
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const handleDirtyChange = useCallback((dirty: boolean) => {
    setIsDirty(dirty);
  }, []);

  function handleCopyLink() {
    if (!profile) return;
    const url = window.location.origin + "/profile/" + profile.username;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // Loading state
  if (loading) {
    return (
      <>
        <Navbar />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
          <div style={{ textAlign: "center" }}>
            <div
              className="animate-spin-slow"
              style={{
                width: 40, height: 40,
                border: "3px solid rgba(124,58,237,0.2)",
                borderTopColor: "#7c3aed",
                borderRadius: "50%",
                margin: "0 auto 16px",
              }}
            />
            <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-heading)" }}>Loading profile...</span>
          </div>
        </div>
      </>
    );
  }

  // Error state
  if (error || !profile) {
    return (
      <>
        <Navbar />
        <div className="page-container animate-fade-in" style={{ padding: "32px 24px", paddingTop: "calc(var(--navbar-height) + 32px)" }}>
          <div className="card" style={{ maxWidth: "500px", margin: "0 auto", textAlign: "center", padding: "40px" }}>
            <div style={{ display: "inline-flex", marginBottom: "12px", color: "#f87171" }}>
              <CircleAlert size={36} aria-hidden="true" />
            </div>
            <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 700, color: "#ef4444", marginBottom: "8px" }}>
              Failed to load profile
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "20px" }}>{error}</p>
            <button className="btn btn-primary" onClick={() => router.push("/dashboard")}>
              <ArrowLeft size={16} aria-hidden="true" />
              Back to Home
            </button>
          </div>
        </div>
      </>
    );
  }

  /* ── Computed values ────────────────────────────────── */
  const totalGames = profile.wins + profile.losses + profile.draws;
  const wPct = totalGames > 0 ? (profile.wins / totalGames) * 100 : 0;
  const lPct = totalGames > 0 ? (profile.losses / totalGames) * 100 : 0;
  const dPct = totalGames > 0 ? (profile.draws / totalGames) * 100 : 100;
  const { current: curTier, next: nextTier, pct: tierPct } = getEloTier(profile.elo_rating);
  const needsPassword = !profile.hasPassword;

  return (
    <>
      <Navbar />
      <div className="animate-fade-in mp-page">
        <div className="mp-inner">
          {/* Header */}
          <h1 className="heading mp-heading">
            <User size={28} aria-hidden="true" />
            My Profile
          </h1>
          <p className="mp-subtitle">
            Manage your account settings and personal information.
          </p>

          {/* Two-column layout */}
          <div className="mp-grid profile-grid">
            {/* Left column: Hero + Stats */}
            <div className="mp-left-col">
              {/* ── Hero Card ── */}
              <div className="card mp-hero">
                {/* Avatar with online dot */}
                <div className="mp-avatar-wrap">
                  <AvatarUpload
                    avatarUrl={profile.avatar_url}
                    username={profile.username}
                    onUpload={uploadAvatar}
                    onRemove={removeAvatar}
                  />
                </div>

                <div className="mp-hero-name">{profile.username}</div>

                {profile.bio && (
                  <div className="mp-hero-bio">{profile.bio}</div>
                )}

                {/* Tier badge row */}
                <div className="mp-badge-row">
                  <TierBadge elo={profile.elo_rating} />
                  <span className="mp-elo-num">ELO {profile.elo_rating}</span>
                </div>

                {/* ELO progress bar */}
                <div className="mp-elo-progress-wrap">
                  <div className="mp-elo-label-row">
                    <span style={{ color: curTier.color, fontWeight: 700 }}>
                      {curTier.name} {profile.elo_rating}
                    </span>
                    {nextTier && (
                      <span style={{ color: nextTier.color, fontWeight: 700 }}>
                        {nextTier.name} {nextTier.min}
                      </span>
                    )}
                    {!nextTier && (
                      <span style={{ color: curTier.color, fontWeight: 700 }}>MAX</span>
                    )}
                  </div>
                  <div className="mp-elo-track">
                    <div
                      className="mp-elo-fill"
                      style={{
                        width: `${tierPct}%`,
                        background: nextTier
                          ? `linear-gradient(90deg, ${curTier.color}, ${nextTier.color})`
                          : curTier.color,
                      }}
                    />
                  </div>
                </div>

                {/* Action buttons */}
                <div className="mp-hero-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => router.push("/profile/" + profile.username)}
                  >
                    <Eye size={16} aria-hidden="true" />
                    View Public Profile
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost mp-copy-btn"
                    onClick={handleCopyLink}
                  >
                    {copied ? (
                      <>
                        <Check size={16} aria-hidden="true" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Link2 size={16} aria-hidden="true" />
                        Copy Profile Link
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* ── Stats card (enhanced) ── */}
              <section className="mp-stats-card">
                <div className="mp-stats-header">
                  <h2 className="mp-sec-title">
                    <BarChart3 size={18} aria-hidden="true" />
                    Stats
                  </h2>
                </div>

                {/* W/L/D stacked bar */}
                {totalGames > 0 && (
                  <div className="mp-wld-bar-wrap">
                    <div className="mp-wld-bar">
                      {wPct > 0 && (
                        <div
                          className="mp-wld-seg mp-wld-w"
                          style={{ width: `${wPct}%` }}
                        >
                          {wPct > 15 && <span>{Math.round(wPct)}%</span>}
                        </div>
                      )}
                      {lPct > 0 && (
                        <div
                          className="mp-wld-seg mp-wld-l"
                          style={{ width: `${lPct}%` }}
                        >
                          {lPct > 15 && <span>{Math.round(lPct)}%</span>}
                        </div>
                      )}
                      {dPct > 0 && (
                        <div
                          className="mp-wld-seg mp-wld-d"
                          style={{ width: `${dPct}%` }}
                        >
                          {dPct > 15 && <span>{Math.round(dPct)}%</span>}
                        </div>
                      )}
                    </div>
                    <div className="mp-wld-legend">
                      <span className="mp-legend-item"><span className="mp-legend-dot mp-dot-w" /> Wins</span>
                      <span className="mp-legend-item"><span className="mp-legend-dot mp-dot-l" /> Losses</span>
                      <span className="mp-legend-item"><span className="mp-legend-dot mp-dot-d" /> Draws</span>
                    </div>
                  </div>
                )}

                <ProfileStats profile={profile} />
              </section>
            </div>

            {/* Right column: Forms */}
            <div className="mp-right-col">
              <ProfileForm
                profile={profile}
                usernameCheck={usernameCheck}
                saving={saving}
                onCheckUsername={checkUsername}
                onSave={updateProfile}
                onSaveEmail={updateEmail}
                onLinkProvider={linkProvider}
                onUnlinkProvider={unlinkProvider}
                onDirtyChange={handleDirtyChange}
              />

              {needsPassword ? (
                <ChangePasswordForm
                  onSubmit={(_, newPassword) => createPassword(newPassword)}
                  requireCurrentPassword={false}
                  title="Create Password"
                  submitLabel="Create Password"
                  savingLabel="Creating..."
                  successMessage="Password created. You can sign in with email + password."
                />
              ) : (
                <ChangePasswordForm onSubmit={(current, newPassword) => updatePassword(current ?? "", newPassword)} />
              )}

              <DangerZone
                username={profile.username}
                onDelete={deleteAccount}
                titleIcon={<ShieldAlert size={20} aria-hidden="true" />}
                deleteIcon={<Trash2 size={16} aria-hidden="true" />}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Scoped styles */}
      <style jsx>{`
        .mp-page {
          padding: 32px 24px;
          padding-top: calc(var(--navbar-height) + 32px);
          min-height: 100vh;
        }

        .mp-inner {
          max-width: 900px;
          margin: 0 auto;
          width: 100%;
        }

        .mp-heading {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 1.8rem;
          margin-bottom: 4px;
        }

        .mp-subtitle {
          color: var(--text-muted);
          font-size: 0.9rem;
          margin-bottom: 28px;
        }

        .mp-grid {
          display: grid;
          grid-template-columns: 300px 1fr;
          gap: 24px;
          align-items: start;
        }

        .mp-left-col,
        .mp-right-col {
          display: flex;
          flex-direction: column;
          gap: 20px;
          min-width: 0;
        }

        /* ── Hero Card ── */
        .mp-hero {
          padding: 28px;
          text-align: center;
          position: relative;
        }

        .mp-avatar-wrap {
          position: relative;
          display: inline-block;
        }

        .mp-hero-name {
          font-family: var(--font-heading);
          font-weight: 700;
          font-size: 1.2rem;
          color: var(--text-primary);
          margin-top: 12px;
          overflow-wrap: anywhere;
        }

        .mp-hero-bio {
          color: var(--text-muted);
          font-size: 0.82rem;
          margin-top: 4px;
          line-height: 1.4;
          overflow-wrap: anywhere;
        }

        .mp-badge-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-top: 12px;
          flex-wrap: wrap;
        }

        .mp-elo-num {
          font-family: var(--font-heading);
          font-weight: 700;
          color: rgba(226,232,240,0.85);
          font-size: 0.85rem;
        }

        /* ELO Progress */
        .mp-elo-progress-wrap {
          margin-top: 16px;
        }

        .mp-elo-label-row {
          display: flex;
          justify-content: space-between;
          font-family: var(--font-heading);
          font-size: 0.7rem;
          margin-bottom: 6px;
          letter-spacing: 0.02em;
        }

        .mp-elo-track {
          width: 100%;
          height: 8px;
          border-radius: 4px;
          background: rgba(255,255,255,0.08);
          overflow: hidden;
        }

        .mp-elo-fill {
          height: 100%;
          border-radius: 4px;
          transition: width 0.6s cubic-bezier(0.4,0,0.2,1);
          box-shadow: 0 0 10px rgba(255,255,255,0.15);
        }

        /* Action buttons */
        .mp-hero-actions {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 16px;
        }

        .mp-hero-actions :global(.btn) {
          width: 100%;
          min-height: 42px;
          white-space: normal;
          line-height: 1.15;
        }

        .mp-copy-btn {
          font-size: 0.82rem !important;
          transition: all 0.2s ease;
        }

        /* ── Stats Card ── */
        .mp-stats-card {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .mp-stats-header {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          margin-bottom: 14px;
        }

        .mp-sec-title {
          margin: 0;
          display: flex;
          align-items: center;
          gap: 8px;
          font-family: var(--font-heading);
          font-size: 1.05rem;
          font-weight: 700;
          color: var(--text-primary);
        }

        .mp-heading :global(svg),
        .mp-hero-actions :global(svg),
        .mp-sec-title :global(svg) {
          flex-shrink: 0;
        }

        /* W/L/D Bar */
        .mp-wld-bar-wrap {
          margin-bottom: 16px;
        }

        .mp-wld-bar {
          display: flex;
          width: 100%;
          height: 8px;
          border-radius: 4px;
          overflow: hidden;
          background: rgba(255,255,255,0.06);
        }

        .mp-wld-seg {
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          transition: width 0.4s ease;
        }

        .mp-wld-seg span {
          font-family: var(--font-heading);
          font-size: 0;
          font-weight: 700;
          color: white;
        }

        .mp-wld-w { background: #22c55e; }
        .mp-wld-l { background: #ef4444; }
        .mp-wld-d { background: #6b7280; }

        .mp-wld-legend {
          display: flex;
          gap: 14px;
          justify-content: center;
          margin-top: 8px;
        }

        .mp-legend-item {
          display: flex;
          align-items: center;
          gap: 4px;
          font-family: var(--font-heading);
          font-size: 0.68rem;
          color: var(--text-muted);
          font-weight: 600;
        }

        .mp-legend-dot {
          width: 8px;
          height: 8px;
          border-radius: 2px;
        }

        .mp-dot-w { background: #22c55e; }
        .mp-dot-l { background: #ef4444; }
        .mp-dot-d { background: #6b7280; }

        /* ── Responsive ── */
        @media (max-width: 768px) {
          .mp-page {
            padding: calc(var(--navbar-height) + 14px) 12px 28px;
          }

          .mp-heading {
            gap: 8px;
            font-size: 1.45rem;
            line-height: 1.1;
            margin-bottom: 5px;
          }

          .mp-heading :global(svg) {
            width: 22px;
            height: 22px;
          }

          .mp-subtitle {
            margin: 0 0 14px;
            font-size: 0.82rem;
            line-height: 1.35;
          }

          .mp-grid {
            grid-template-columns: 1fr !important;
            gap: 12px;
          }

          .mp-left-col,
          .mp-right-col {
            gap: 12px;
          }

          .mp-hero {
            padding: 16px 14px;
            border-radius: 12px;
          }

          .mp-hero-name {
            margin-top: 10px;
            font-size: 1.12rem;
            line-height: 1.15;
          }

          .mp-hero-bio {
            max-width: 100%;
            font-size: 0.78rem;
          }

          .mp-badge-row {
            gap: 7px;
            margin-top: 10px;
          }

          .mp-elo-progress-wrap {
            margin-top: 12px;
          }

          .mp-elo-label-row {
            gap: 10px;
            font-size: 0.66rem;
            line-height: 1.2;
          }

          .mp-hero-actions {
            gap: 7px;
            margin-top: 14px;
          }

          .mp-hero-actions :global(.btn) {
            min-height: 40px;
            padding: 9px 12px;
            border-radius: 10px;
            font-size: 0.86rem;
          }

          .mp-copy-btn {
            font-size: 0.8rem !important;
          }

          .mp-stats-card {
            gap: 9px;
          }

          .mp-stats-header {
            margin-bottom: 0;
          }

          .mp-sec-title {
            font-size: 0.98rem;
          }

          .mp-wld-bar-wrap {
            margin-bottom: 0;
          }

          .mp-wld-legend {
            flex-wrap: wrap;
            gap: 8px 12px;
            justify-content: flex-start;
            margin-top: 7px;
          }

          .mp-right-col :global(.card),
          .mp-stats-card :global(.card) {
            padding: 16px !important;
            border-radius: 12px;
          }

          .mp-right-col :global(.input) {
            min-height: 42px;
            font-size: 16px;
          }

          .mp-right-col :global(textarea.input) {
            min-height: 92px;
          }

          .mp-right-col :global(.btn) {
            min-height: 42px;
            padding: 10px 14px;
            border-radius: 10px;
            white-space: normal;
            line-height: 1.15;
          }
        }

        @media (max-width: 420px) {
          .mp-page {
            padding-left: 10px;
            padding-right: 10px;
          }

          .mp-heading {
            font-size: 1.34rem;
          }

          .mp-subtitle {
            font-size: 0.78rem;
          }

          .mp-hero {
            padding: 14px 12px;
          }

          .mp-elo-label-row {
            flex-direction: column;
            align-items: center;
            gap: 3px;
          }

          .mp-right-col :global(.card),
          .mp-stats-card :global(.card) {
            padding: 14px !important;
          }
        }
      `}</style>
    </>
  );
}
