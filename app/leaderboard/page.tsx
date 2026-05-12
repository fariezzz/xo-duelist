"use client";
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Award, Medal, Trophy } from 'lucide-react';
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

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const s = await supabaseClient.auth.getSession();
      if (!cancelled) setMeId(s.data.session?.user.id ?? null);
      const { data } = await supabaseClient
        .from('profiles')
        .select('id, username, elo_rating, wins, losses, avatar_url')
        .order('elo_rating', { ascending: false })
        .limit(50);
      if (!cancelled) setRows((data ?? []) as LeaderboardRow[]);
    };
    load();
    const channel = supabaseClient
      .channel('realtime-leaderboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => { load(); })
      .subscribe();
    return () => { cancelled = true; supabaseClient.removeChannel(channel); };
  }, []);

  return (
    <>
      <Navbar />
      <div className="page-container animate-fade-in" style={{ padding: '32px 24px', paddingTop: 'calc(var(--navbar-height) + 32px)' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <h1 className="heading" style={{ fontSize: '2rem', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Trophy size={30} strokeWidth={2.4} color="var(--accent-gold)" />
            Leaderboard
          </h1>
          <div className="card" style={{ padding: '8px 0', overflow: 'auto' }}>
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
