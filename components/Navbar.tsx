"use client";
import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import { supabaseClient } from '../lib/supabase';
import TierBadge from './TierBadge';

export default function Navbar() {
  const [elo, setElo] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const { data: sess } = await supabaseClient.auth.getSession();
      if (!sess.session) return;
      const { data } = await supabaseClient
        .from('profiles')
        .select('elo_rating')
        .eq('id', sess.session.user.id)
        .maybeSingle();
      if (data) setElo(data.elo_rating);
    })();
  }, []);

  async function signOut() {
    await supabaseClient.auth.signOut();
    window.location.href = '/';
  }

  return (
    <nav
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        background: 'rgba(10, 15, 30, 0.8)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        height: '72px',
      }}
    >
      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '0 24px',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* Logo */}
        <Link
          href="/dashboard"
          style={{
            textDecoration: 'none',
            fontFamily: 'var(--font-heading)',
            fontWeight: 700,
            fontSize: '1.5rem',
            letterSpacing: '0.04em',
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
          }}
        >
          <span style={{ color: '#7c3aed', textShadow: '0 0 20px rgba(124,58,237,0.4)' }}>X</span>
          <span style={{ color: '#f59e0b', textShadow: '0 0 20px rgba(245,158,11,0.4)' }}>O</span>
          <span style={{ color: 'var(--text-primary)', marginLeft: '6px' }}>Duelist</span>
        </Link>

        {/* Right side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          {/* Nav links */}
          <Link
            href="/leaderboard"
            style={{
              color: 'var(--text-muted)',
              textDecoration: 'none',
              fontSize: '0.9rem',
              fontWeight: 500,
              transition: 'color 0.2s',
              fontFamily: 'var(--font-heading)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            Leaderboard
          </Link>
          <Link
            href="/history"
            style={{
              color: 'var(--text-muted)',
              textDecoration: 'none',
              fontSize: '0.9rem',
              fontWeight: 500,
              transition: 'color 0.2s',
              fontFamily: 'var(--font-heading)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            History
          </Link>

          {/* ELO badge */}
          {elo !== null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  color: 'var(--accent-gold)',
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                }}
              >
                {elo}
              </span>
              <TierBadge elo={elo} />
            </div>
          )}

          {/* Sign out */}
          <button
            onClick={signOut}
            className="btn btn-danger"
            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
          >
            Sign Out
          </button>
        </div>
      </div>
    </nav>
  );
}
