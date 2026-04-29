"use client";
import React, { useEffect, useState } from 'react';
import { supabaseClient } from '../../lib/supabase';
import Navbar from '../../components/Navbar';

export default function HistoryPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [meId, setMeId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabaseClient.channel> | null = null;

    const load = async (uid?: string | null) => {
      if (!uid) return;
      const { data } = await supabaseClient
        .from('match_history')
        .select('id, player1_id, player2_id, winner_id, winner_elo_before, winner_elo_after, loser_elo_before, loser_elo_after, played_at')
        .or(`player1_id.eq.${uid},player2_id.eq.${uid}`)
        .order('played_at', { ascending: false })
        .limit(20);
      if (!cancelled) setRows(data || []);
    };

    (async () => {
      const s = await supabaseClient.auth.getSession();
      const uid = s.data.session?.user.id ?? null;
      if (!cancelled) setMeId(uid);
      await load(uid);

      if (!uid || cancelled) return;
      channel = supabaseClient
        .channel(`realtime-history-${uid}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'match_history' }, (payload: any) => {
          const record = payload.new || payload.record;
          if (!record) return;
          if (record.player1_id === uid || record.player2_id === uid) {
            load(uid);
          }
        })
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabaseClient.removeChannel(channel);
    };
  }, []);

  return (
    <>
      <Navbar />
      <div className="page-container animate-fade-in" style={{ padding: '32px 24px', paddingTop: 'calc(var(--navbar-height) + 32px)' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <h1 className="heading" style={{ fontSize: '2rem', marginBottom: '24px' }}>📜 Match History</h1>
          <div className="card" style={{ padding: '8px 0', overflow: 'auto' }}>
            <table className="table-premium">
              <thead>
                <tr>
                  <th style={{ paddingLeft: '20px' }}>Result</th>
                  <th>Opponent</th>
                  <th>ELO Change</th>
                  <th style={{ paddingRight: '20px' }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const isPlayer1 = meId ? r.player1_id === meId : false;
                  const result = r.winner_id ? (r.winner_id === meId ? 'Win' : 'Loss') : 'Draw';
                  const eloDelta = r.winner_id
                    ? (r.winner_id === meId ? (r.winner_elo_after - r.winner_elo_before) : (r.loser_elo_after - r.loser_elo_before))
                    : 0;
                  const opponent = isPlayer1 ? r.player2_id : r.player1_id;

                  let rowBg = 'transparent';
                  let resultColor = 'var(--text-muted)';
                  let resultIcon = '🤝';
                  if (result === 'Win') {
                    rowBg = 'rgba(16, 185, 129, 0.06)';
                    resultColor = '#10b981';
                    resultIcon = '🏆';
                  } else if (result === 'Loss') {
                    rowBg = 'rgba(239, 68, 68, 0.06)';
                    resultColor = '#ef4444';
                    resultIcon = '💀';
                  }

                  return (
                    <tr key={r.id} style={{ background: rowBg }}>
                      <td style={{ paddingLeft: '20px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-heading)', fontWeight: 700, color: resultColor }}>
                          {resultIcon} {result}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        {(opponent || '').substring(0, 8)}...
                      </td>
                      <td>
                        <span style={{
                          fontFamily: 'var(--font-heading)',
                          fontWeight: 700,
                          color: eloDelta > 0 ? '#10b981' : eloDelta < 0 ? '#ef4444' : 'var(--text-muted)',
                        }}>
                          {eloDelta > 0 ? `+${eloDelta}` : eloDelta}
                        </span>
                      </td>
                      <td style={{ paddingRight: '20px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        {new Date(r.played_at).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                      No matches yet. Enter the arena!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
