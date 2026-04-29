"use client";
import React, { useEffect, useState } from 'react';
import { supabaseClient } from '../../lib/supabase';
import { useRouter } from 'next/navigation';
import Navbar from '../../components/Navbar';
import TierBadge from '../../components/TierBadge';

export default function DashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rank, setRank] = useState<{ position: number; total: number } | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
        if (sessionError) throw sessionError;

        const session = sessionData.session;
        if (!session) {
          router.push('/');
          return;
        }

        const uid = session.user.id;
        const fallbackUsername =
          session.user.user_metadata?.username ||
          session.user.email?.split('@')[0] ||
          'Player';

        const { data: existingProfile, error: profileError } = await supabaseClient
          .from('profiles')
          .select('*')
          .eq('id', uid)
          .maybeSingle();

        if (profileError) throw profileError;

        let nextProfile = existingProfile;

        if (!nextProfile) {
          const { data: createdProfile, error: createError } = await supabaseClient
            .from('profiles')
            .upsert(
              {
                id: uid,
                username: fallbackUsername,
                elo_rating: 1000,
                wins: 0,
                losses: 0,
                draws: 0,
              },
              { onConflict: 'id' }
            )
            .select('*')
            .single();

          if (createError) throw createError;
          nextProfile = createdProfile;
        }

        if (!cancelled) setProfile(nextProfile);

        // Fetch rank position
        const { count } = await supabaseClient
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .gte('elo_rating', nextProfile.elo_rating);
        const { count: total } = await supabaseClient
          .from('profiles')
          .select('id', { count: 'exact', head: true });
        if (!cancelled && count !== null && total !== null) {
          setRank({ position: count, total });
        }
      } catch (err: any) {
        console.error('Dashboard load failed:', err);
        if (!cancelled) setError(err?.message || 'Failed to load dashboard');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="page-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div className="animate-spin-slow" style={{ width: 40, height: 40, border: '3px solid rgba(124,58,237,0.2)', borderTopColor: '#7c3aed', borderRadius: '50%', margin: '0 auto 16px' }} />
            <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-heading)' }}>Loading arena...</span>
          </div>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Navbar />
        <div className="page-container" style={{ padding: '32px' }}>
          <div
            className="card"
            style={{
              maxWidth: '480px',
              margin: '0 auto',
              borderColor: 'rgba(239, 68, 68, 0.3)',
              boxShadow: '0 0 30px rgba(239, 68, 68, 0.1)',
            }}
          >
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1.2rem', color: '#ef4444' }}>
              Failed to load dashboard
            </div>
            <div style={{ marginTop: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>{error}</div>
            <button className="btn btn-primary" style={{ marginTop: '16px' }} onClick={() => window.location.reload()}>
              Try Again
            </button>
          </div>
        </div>
      </>
    );
  }

  if (!profile) return null;

  const winrate =
    profile.wins + profile.losses === 0
      ? 0
      : Math.round((profile.wins / (profile.wins + profile.losses)) * 100);

  // Circular progress ring values
  const ringSize = 64;
  const ringStroke = 5;
  const ringRadius = (ringSize - ringStroke) / 2;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference - (winrate / 100) * ringCircumference;

  return (
    <>
      <Navbar />
      <div className="page-container animate-fade-in" style={{ padding: '32px 24px' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>

          {/* ── Hero Section ────────────────────────────── */}
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            {/* Avatar */}
            <div
              className="animate-float"
              style={{
                width: 88,
                height: 88,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #7c3aed, #f59e0b)',
                padding: '3px',
                margin: '0 auto 20px',
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  background: 'var(--bg-base)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 700,
                  fontSize: '2rem',
                  color: 'var(--text-primary)',
                }}
              >
                {profile.username.charAt(0).toUpperCase()}
              </div>
            </div>

            {/* Username */}
            <h1
              className="heading text-glow"
              style={{
                fontSize: '2.2rem',
                marginBottom: '8px',
              }}
            >
              {profile.username}
            </h1>

            {/* ELO */}
            <div style={{ marginBottom: '10px' }}>
              <span
                className="animate-shimmer"
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 700,
                  fontSize: '2.5rem',
                  lineHeight: 1.2,
                }}
              >
                {profile.elo_rating}
              </span>
            </div>

            {/* Tier Badge */}
            <div style={{ marginBottom: '8px' }}>
              <TierBadge elo={profile.elo_rating} />
            </div>

            {/* Rank */}
            {rank && (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontFamily: 'var(--font-heading)' }}>
                Rank #{rank.position} of {rank.total} players
              </p>
            )}
          </div>

          {/* ── Stats Row ───────────────────────────────── */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '16px',
              marginBottom: '32px',
            }}
          >
            {/* Wins */}
            <div className="card border-glow-green" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '6px' }}>🏆</div>
              <div
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 700,
                  fontSize: '2rem',
                  color: '#10b981',
                  lineHeight: 1.2,
                }}
              >
                {profile.wins}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontFamily: 'var(--font-heading)', fontWeight: 600, marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Wins
              </div>
            </div>

            {/* Losses */}
            <div className="card border-glow-red" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '6px' }}>💀</div>
              <div
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 700,
                  fontSize: '2rem',
                  color: '#ef4444',
                  lineHeight: 1.2,
                }}
              >
                {profile.losses}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontFamily: 'var(--font-heading)', fontWeight: 600, marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Losses
              </div>
            </div>

            {/* Draws */}
            <div className="card border-glow-gray" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '6px' }}>🤝</div>
              <div
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 700,
                  fontSize: '2rem',
                  color: 'var(--text-muted)',
                  lineHeight: 1.2,
                }}
              >
                {profile.draws}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontFamily: 'var(--font-heading)', fontWeight: 600, marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Draws
              </div>
            </div>

            {/* Winrate */}
            <div className="card border-glow-violet" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <svg width={ringSize} height={ringSize} style={{ marginBottom: '4px' }}>
                <circle
                  cx={ringSize / 2}
                  cy={ringSize / 2}
                  r={ringRadius}
                  fill="none"
                  stroke="rgba(255,255,255,0.06)"
                  strokeWidth={ringStroke}
                />
                <circle
                  cx={ringSize / 2}
                  cy={ringSize / 2}
                  r={ringRadius}
                  fill="none"
                  stroke="url(#winrate-gradient)"
                  strokeWidth={ringStroke}
                  strokeLinecap="round"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringOffset}
                  className="progress-ring-circle"
                />
                <defs>
                  <linearGradient id="winrate-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#7c3aed" />
                    <stop offset="100%" stopColor="#f59e0b" />
                  </linearGradient>
                </defs>
                <text
                  x="50%"
                  y="50%"
                  dominantBaseline="central"
                  textAnchor="middle"
                  style={{
                    fontFamily: 'var(--font-heading)',
                    fontWeight: 700,
                    fontSize: '1rem',
                    fill: 'var(--text-primary)',
                  }}
                >
                  {winrate}%
                </text>
              </svg>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontFamily: 'var(--font-heading)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Winrate
              </div>
            </div>
          </div>

          {/* ── Action Buttons ──────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px' }}>
            <button
              className="btn btn-primary btn-lg animate-pulse-glow"
              onClick={() => router.push('/matchmaking')}
              style={{ width: '100%', fontSize: '1.2rem', padding: '18px 32px' }}
            >
              ⚔️ Find Match
            </button>
            <button
              className="btn btn-secondary btn-lg"
              onClick={() => router.push('/lobby')}
              style={{ width: '100%' }}
            >
              🏠 Lobby Room
            </button>
          </div>

          {/* ── Bottom Nav Cards ────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button
              className="card card-hover"
              onClick={() => router.push('/leaderboard')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                width: '100%',
                textAlign: 'left',
                cursor: 'pointer',
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'var(--card-bg)',
              }}
            >
              <span style={{ fontSize: '1.8rem' }}>🏅</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                  Leaderboard
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  See where you stand among all players
                </div>
              </div>
              <span style={{ color: 'var(--text-muted)', fontSize: '1.2rem' }}>›</span>
            </button>

            <button
              className="card card-hover"
              onClick={() => router.push('/history')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                width: '100%',
                textAlign: 'left',
                cursor: 'pointer',
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'var(--card-bg)',
              }}
            >
              <span style={{ fontSize: '1.8rem' }}>📜</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                  Match History
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Review your past battles and ELO changes
                </div>
              </div>
              <span style={{ color: 'var(--text-muted)', fontSize: '1.2rem' }}>›</span>
            </button>
          </div>

        </div>
      </div>
    </>
  );
}
