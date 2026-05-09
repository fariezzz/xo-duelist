"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Navbar from "../../../components/Navbar";
import TierBadge from "../../../components/TierBadge";
import { supabaseClient } from "../../../lib/supabase";
import { getPublicProfileByUsername, getPublicProfileMatches, type PublicMatchRow } from "../../../lib/friendsService";

type OpponentMap = Record<string, string>;

function initials(name: string): string {
  const p = name.split(/[\s_]+/).filter(Boolean);
  if (p.length === 0) return "?";
  return `${p[0][0] ?? ""}${p[1]?.[0] ?? ""}`.toUpperCase().slice(0, 2);
}

function winRate(wins: number, losses: number, draws: number): string {
  const total = wins + losses + draws;
  if (total === 0) return "—";
  return `${Math.round((wins / total) * 1000) / 10}%`;
}

export default function PublicProfilePage() {
  const router = useRouter();
  const params = useParams();
  const usernameParam = params.username;
  const username = typeof usernameParam === "string" ? usernameParam : Array.isArray(usernameParam) ? usernameParam[0] : "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof getPublicProfileByUsername>>>(null);
  const [matches, setMatches] = useState<PublicMatchRow[]>([]);
  const [opponents, setOpponents] = useState<OpponentMap>({});

  const load = useCallback(async () => {
    if (!username) {
      setError("Invalid profile.");
      setLoading(false);
      return;
    }

    try {
      setError(null);
      const { data: sessionData } = await supabaseClient.auth.getSession();
      const uid = sessionData.session?.user.id ?? null;
      setViewerId(uid);

      const p = await getPublicProfileByUsername(username);
      if (!p) {
        setProfile(null);
        setMatches([]);
        setOpponents({});
        setLoading(false);
        return;
      }

      setProfile(p);

      const mh = await getPublicProfileMatches(p.id, 10);
      setMatches(mh);

      const oppIds = new Set<string>();
      for (const m of mh) {
        if (m.player1_id === p.id) oppIds.add(m.player2_id);
        else oppIds.add(m.player1_id);
      }

      if (oppIds.size > 0) {
        const { data: profs, error: pe } = await supabaseClient
          .from("profiles")
          .select("id, username")
          .in("id", [...oppIds]);
        if (pe) throw pe;
        const map: OpponentMap = {};
        for (const row of profs ?? []) {
          if (row.id && row.username) map[row.id] = row.username;
        }
        setOpponents(map);
      } else {
        setOpponents({});
      }
    } catch (e: unknown) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Failed to load profile.");
    } finally {
      setLoading(false);
    }
  }, [username]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="pp-wrap">
          <div className="pp-loading">Loading profile…</div>
        </div>
        <style jsx>{`
          .pp-wrap {
            min-height: 100vh;
            padding: calc(var(--navbar-height) + 32px) 20px 40px;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .pp-loading {
            color: var(--text-muted);
            font-family: var(--font-heading);
          }
        `}</style>
      </>
    );
  }

  if (error || !profile) {
    return (
      <>
        <Navbar />
        <div className="pp-wrap">
          <div className="card pp-card">
            <h1 className="pp-h1">Profile not found</h1>
            <p className="pp-muted">{error ?? `No user named "${username}".`}</p>
            <button type="button" className="btn btn-primary" onClick={() => router.push("/dashboard")}>
              Back to dashboard
            </button>
          </div>
        </div>
        <style jsx>{`
          .pp-wrap {
            min-height: 100vh;
            padding: calc(var(--navbar-height) + 32px) 20px 40px;
            display: flex;
            justify-content: center;
          }
          .pp-card {
            max-width: 420px;
            text-align: center;
            padding: 28px;
          }
          .pp-h1 {
            margin: 0 0 8px;
            font-family: var(--font-heading);
            font-size: 1.4rem;
          }
          .pp-muted {
            color: var(--text-muted);
            margin: 0 0 18px;
            font-size: 0.92rem;
          }
        `}</style>
      </>
    );
  }

  const isOwn = viewerId !== null && viewerId === profile.id;

  return (
    <>
      <Navbar />
      <div className="pp-page animate-fade-in">
        <div className="pp-inner">
          <header className="pp-hero card">
            <div className="pp-avatar">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="" width={96} height={96} />
              ) : (
                <span>{initials(profile.username)}</span>
              )}
            </div>
            <div className="pp-head-text">
              <h1 className="pp-name">{profile.username}</h1>
              <div className="pp-badges">
                <TierBadge elo={profile.elo_rating} />
                <span className="pp-elo-num">ELO {profile.elo_rating}</span>
              </div>
              {isOwn ? (
                <button type="button" className="btn btn-secondary pp-edit" onClick={() => router.push("/profile")}>
                  Edit profile
                </button>
              ) : null}
            </div>
          </header>

          <section className="card pp-stats">
            <h2 className="pp-sec-title">Stats</h2>
            <div className="pp-stat-grid">
              <div>
                <span className="pp-label">Wins</span>
                <strong>{profile.wins}</strong>
              </div>
              <div>
                <span className="pp-label">Losses</span>
                <strong>{profile.losses}</strong>
              </div>
              <div>
                <span className="pp-label">Draws</span>
                <strong>{profile.draws}</strong>
              </div>
              <div>
                <span className="pp-label">Win rate</span>
                <strong>{winRate(profile.wins, profile.losses, profile.draws)}</strong>
              </div>
            </div>
          </section>

          <section className="card pp-history">
            <h2 className="pp-sec-title">Recent matches</h2>
            {matches.length === 0 ? (
              <p className="pp-muted">No ranked history yet.</p>
            ) : (
              <ul className="pp-matches">
                {matches.map((m) => {
                  const oppId = m.player1_id === profile.id ? m.player2_id : m.player1_id;
                  const oppName = opponents[oppId] ?? "Opponent";
                  let result: "W" | "L" | "D" = "D";
                  if (m.winner_id === profile.id) result = "W";
                  else if (m.loser_id === profile.id) result = "L";
                  const mode = m.match_type === "pvp" ? "PvP" : m.match_type?.startsWith("ai") ? "AI" : m.match_type ?? "—";
                  return (
                    <li key={m.id} className="pp-match-row">
                      <span className={`pp-res pp-res-${result}`}>{result}</span>
                      <span className="pp-opp">vs {oppName}</span>
                      <span className="pp-mode">{mode}</span>
                      <span className="pp-date">{new Date(m.played_at).toLocaleString()}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>

      <style jsx>{`
        .pp-page {
          position: relative;
          z-index: 1;
          min-height: 100vh;
          padding: calc(var(--navbar-height) + 20px) 18px 40px;
        }

        .pp-inner {
          max-width: 720px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .pp-hero {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 20px;
          padding: 22px;
        }

        .pp-avatar {
          width: 96px;
          height: 96px;
          border-radius: 50%;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.06);
          border: 2px solid rgba(124, 58, 237, 0.35);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .pp-avatar :global(img) {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .pp-avatar span {
          font-family: var(--font-heading);
          font-size: 1.5rem;
          font-weight: 800;
          color: #f8fafc;
        }

        .pp-head-text {
          flex: 1;
          min-width: 200px;
        }

        .pp-name {
          margin: 0 0 8px;
          font-family: var(--font-heading);
          font-size: 1.75rem;
          color: #f8fafc;
        }

        .pp-badges {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          margin-bottom: 12px;
        }

        .pp-elo-num {
          font-family: var(--font-heading);
          font-weight: 700;
          color: rgba(226, 232, 240, 0.85);
          font-size: 0.9rem;
        }

        .pp-edit {
          margin-top: 4px;
        }

        .pp-stats,
        .pp-history {
          padding: 18px 20px;
        }

        .pp-sec-title {
          margin: 0 0 14px;
          font-family: var(--font-heading);
          font-size: 1.05rem;
          color: #f8fafc;
        }

        .pp-stat-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
          gap: 14px;
        }

        .pp-label {
          display: block;
          font-size: 0.72rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(148, 163, 184, 0.95);
          font-family: var(--font-heading);
          font-weight: 700;
          margin-bottom: 4px;
        }

        .pp-stat-grid strong {
          font-family: var(--font-heading);
          font-size: 1.2rem;
          color: #f8fafc;
        }

        .pp-muted {
          color: rgba(148, 163, 184, 0.92);
          font-size: 0.9rem;
          margin: 0;
        }

        .pp-matches {
          list-style: none;
          margin: 0;
          padding: 0;
        }

        .pp-match-row {
          display: grid;
          grid-template-columns: 32px minmax(0, 1fr) auto auto;
          gap: 10px;
          align-items: center;
          padding: 10px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          font-size: 0.88rem;
        }

        .pp-match-row:last-child {
          border-bottom: none;
        }

        .pp-res {
          font-family: var(--font-heading);
          font-weight: 800;
          text-align: center;
        }

        .pp-res-W {
          color: #34d399;
        }

        .pp-res-L {
          color: #f87171;
        }

        .pp-res-D {
          color: #94a3b8;
        }

        .pp-opp {
          color: #e2e8f0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .pp-mode {
          color: #a78bfa;
          font-family: var(--font-heading);
          font-weight: 600;
          font-size: 0.78rem;
        }

        .pp-date {
          color: rgba(148, 163, 184, 0.9);
          font-size: 0.78rem;
          white-space: nowrap;
        }

        @media (max-width: 600px) {
          .pp-match-row {
            grid-template-columns: 28px minmax(0, 1fr);
            grid-template-rows: auto auto;
          }

          .pp-mode,
          .pp-date {
            grid-column: 2;
          }
        }
      `}</style>
    </>
  );
}
