"use client";
import React, { useEffect, useState } from 'react';
import { supabaseClient } from '../../lib/supabase';
import Navbar from '../../components/Navbar';
import TierBadge from '../../components/TierBadge';

export default function LeaderboardPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [meId, setMeId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const s = await supabaseClient.auth.getSession();
      if (!cancelled) setMeId(s.data.session?.user.id ?? null);
      const { data } = await supabaseClient
        .from('profiles')
        .select('id, username, elo_rating, wins, losses')
        .order('elo_rating', { ascending: false })
        .limit(50);
      if (!cancelled) setRows(data || []);
    };
    load();
    const channel = supabaseClient
      .channel('realtime-leaderboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => { load(); })
      .subscribe();
    return () => { cancelled = true; supabaseClient.removeChannel(channel); };
  }, []);

  const medals = ['🥇', '🥈', '🥉'];

  return (
    <>
      <Navbar />
      <div className="page-container animate-fade-in" style={{ padding: '32px 24px', paddingTop: 'calc(var(--navbar-height) + 32px)' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <h1 className="heading" style={{ fontSize: '2rem', marginBottom: '24px' }}>🏅 Leaderboard</h1>
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
                  return (
                    <tr key={r.id} style={{ background: isMe ? 'rgba(124,58,237,0.08)' : undefined, borderLeft: isMe ? '3px solid rgba(124,58,237,0.5)' : '3px solid transparent' }}>
                      <td style={{ paddingLeft: '20px', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: i < 3 ? '1.3rem' : '0.95rem' }}>
                        {i < 3 ? medals[i] : i + 1}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: i < 3 ? 'linear-gradient(135deg,#7c3aed,#f59e0b)' : 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-primary)', flexShrink: 0 }}>
                            {r.username?.charAt(0).toUpperCase() || '?'}
                          </div>
                          <span style={{ fontWeight: isMe ? 700 : 500 }}>
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
    </>
  );
}
