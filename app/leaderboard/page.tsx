"use client";
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Award, Medal, RefreshCw, Trophy } from 'lucide-react';
import { supabaseClient } from '../../lib/supabase';
import Navbar from '../../components/Navbar';
import TierBadge from '../../components/TierBadge';

type LeaderboardRow = {
  id: string;
  username: string;
  elo_rating: number;
  wins: number;
  losses: number;
  avatar_url: string | null;
};

const topRanks = [
  { Icon: Trophy, color: '#fbbf24', label: 'Rank 1' },
  { Icon: Medal, color: '#cbd5e1', label: 'Rank 2' },
  { Icon: Award, color: '#f97316', label: 'Rank 3' },
];

export default function LeaderboardPage() {
  const router = useRouter();
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshTimerRef = useRef<number | null>(null);

  const loadLeaderboard = useCallback(async (
    shouldApply: () => boolean = () => true,
    options: { showLoading?: boolean; showRefreshing?: boolean } = {}
  ) => {
    if (options.showLoading && shouldApply()) setLoading(true);
    if (options.showRefreshing && shouldApply()) setRefreshing(true);

    try {
      if (shouldApply()) setError(null);
      const [sessionRes, leaderboardRes] = await Promise.all([
        supabaseClient.auth.getSession(),
        supabaseClient
          .from('profiles')
          .select('id, username, elo_rating, wins, losses, avatar_url')
          .order('elo_rating', { ascending: false })
          .limit(50),
      ]);

      if (leaderboardRes.error) throw leaderboardRes.error;
      if (!shouldApply()) return;

      setMeId(sessionRes.data.session?.user.id ?? null);
      setRows((leaderboardRes.data ?? []) as LeaderboardRow[]);
    } catch (err) {
      console.error('Failed to load leaderboard:', err);
      if (shouldApply()) setError('Failed to load leaderboard. Please try again.');
    } finally {
      if (shouldApply()) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const shouldApply = () => !cancelled;
    const scheduleRefresh = (delay = 1200) => {
      if (document.visibilityState === 'hidden') return;
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null;
        void loadLeaderboard(shouldApply);
      }, delay);
    };

    scheduleRefresh(0);

    const channel = supabaseClient
      .channel('realtime-leaderboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_history' }, () => {
        scheduleRefresh();
      })
      .subscribe();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') scheduleRefresh(0);
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibility);
      supabaseClient.removeChannel(channel);
    };
  }, [loadLeaderboard]);

  return (
    <>
      <Navbar />
      <div className="page-container animate-fade-in" style={{ padding: '32px 24px', paddingTop: 'calc(var(--navbar-height) + 32px)' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
            <h1 className="heading" style={{ fontSize: '2rem', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Trophy size={30} strokeWidth={2.4} color="var(--accent-gold)" />
              Leaderboard
            </h1>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void loadLeaderboard(undefined, { showRefreshing: true })}
              disabled={refreshing}
              style={{ padding: '8px 14px', display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '0.85rem' }}
            >
              <RefreshCw className={refreshing ? 'animate-spin-slow' : undefined} size={15} strokeWidth={2.35} aria-hidden="true" />
              Refresh
            </button>
          </div>

          {error && (
            <div className="card" style={{ marginBottom: '14px', padding: '12px 16px', color: '#ef4444', borderColor: 'rgba(239,68,68,0.25)' }}>
              {error}
            </div>
          )}

          <div className="card" style={{ padding: '8px 0', overflow: 'auto' }}>
            {loading ? (
              <div style={{ minHeight: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div className="animate-spin-slow" style={{ width: 36, height: 36, border: '3px solid rgba(124,58,237,0.2)', borderTopColor: '#7c3aed', borderRadius: '50%' }} />
              </div>
            ) : (
              <table className="table-premium">
                <thead>
                  <tr>
                    <th style={{ paddingLeft: '20px', width: '60px' }}>Rank</th>
                    <th>Player</th>
                    <th>ELO</th>
                    <th>W</th>
                    <th>L</th>
                    <th>Rate</th>
                    <th style={{ paddingRight: '20px' }}>Tier</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const wr = r.wins + r.losses === 0 ? 0 : Math.round((r.wins / (r.wins + r.losses)) * 100);
                    const isMe = r.id === meId;
                    const TopRank = i < topRanks.length ? topRanks[i] : null;
                    return (
                      <tr key={r.id} style={{ background: isMe ? 'rgba(124,58,237,0.08)' : undefined, borderLeft: isMe ? '3px solid rgba(124,58,237,0.5)' : '3px solid transparent' }}>
                        <td style={{ paddingLeft: '20px', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: i < 3 ? '1.3rem' : '0.95rem' }}>
                          {TopRank ? (
                            <span className="lb-rank-icon" title={TopRank.label} aria-label={TopRank.label}>
                              <TopRank.Icon size={21} strokeWidth={2.5} color={TopRank.color} />
                            </span>
                          ) : (
                            i + 1
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }} onClick={() => router.push(`/profile/${encodeURIComponent(r.username)}`)} title={`View ${r.username}'s profile`}>
                            <div className="lb-avatar" style={{ background: r.avatar_url ? 'transparent' : (i < 3 ? 'linear-gradient(135deg,#7c3aed,#f59e0b)' : 'rgba(255,255,255,0.08)'), border: i < 3 ? '2px solid rgba(124,58,237,0.3)' : 'none' }}>
                              {r.avatar_url ? (
                                <img src={r.avatar_url} alt={r.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                r.username?.charAt(0).toUpperCase() || '?'
                              )}
                            </div>
                            <span className="lb-username" style={{ fontWeight: isMe ? 700 : 500 }}>
                              {r.username}
                              {isMe && <span style={{ marginLeft: '6px', fontSize: '0.65rem', padding: '2px 6px', borderRadius: '6px', background: 'rgba(124,58,237,0.2)', color: '#a78bfa', fontWeight: 600 }}>YOU</span>}
                            </span>
                          </div>
                        </td>
                        <td style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, color: 'var(--accent-gold)' }}>{r.elo_rating}</td>
                        <td style={{ color: '#10b981', fontWeight: 600 }}>{r.wins}</td>
                        <td style={{ color: '#ef4444', fontWeight: 600 }}>{r.losses}</td>
                        <td style={{ fontFamily: 'var(--font-heading)', fontWeight: 600 }}>{wr}%</td>
                        <td style={{ paddingRight: '20px' }}><TierBadge elo={r.elo_rating} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        .lb-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--font-heading);
          font-weight: 700;
          font-size: 0.75rem;
          color: var(--text-primary);
          flex-shrink: 0;
          overflow: hidden;
          transition: transform 0.15s, border-color 0.2s;
        }
        .lb-avatar:hover {
          transform: scale(1.1);
          border-color: rgba(167, 139, 250, 0.5) !important;
        }
        .lb-rank-icon {
          width: 28px;
          height: 28px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          vertical-align: middle;
        }
        .lb-username {
          transition: color 0.2s;
        }
        .lb-username:hover {
          color: #a78bfa;
        }
      `}</style>
    </>
  );
}
