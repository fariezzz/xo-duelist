"use client";
import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseClient } from '../lib/supabase';
import TierBadge from './TierBadge';
import { clearCachedProfile, getCachedProfile, setCachedProfile } from '../lib/profileCache';

export default function Navbar() {
  const router = useRouter();
  const [elo, setElo] = useState<number | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let profileChannel: ReturnType<typeof supabaseClient.channel> | null = null;

    async function fetchProfileElo(userId: string) {
      const { data } = await supabaseClient
        .from('profiles')
        .select('elo_rating')
        .eq('id', userId)
        .maybeSingle();

      if (cancelled || typeof data?.elo_rating !== 'number') return;
      setElo(data.elo_rating);
      setCachedProfile(userId, data.elo_rating);
    }

    function mountProfileListener(userId: string) {
      if (profileChannel) supabaseClient.removeChannel(profileChannel);
      profileChannel = supabaseClient
        .channel(`profile-elo-${userId}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
          (payload: { new?: { elo_rating?: number } }) => {
            const nextElo = payload.new?.elo_rating;
            if (typeof nextElo !== 'number') return;
            if (cancelled) return;
            setElo(nextElo);
            setCachedProfile(userId, nextElo);
          }
        )
        .subscribe();
    }

    async function syncForUser(userId: string | null) {
      setCurrentUserId(userId);
      if (!userId) {
        setElo(null);
        if (profileChannel) supabaseClient.removeChannel(profileChannel);
        profileChannel = null;
        return;
      }

      const cached = getCachedProfile(userId);
      if (cached) setElo(cached.elo);
      await fetchProfileElo(userId);
      if (cancelled) return;
      mountProfileListener(userId);
    }

    (async () => {
      const { data } = await supabaseClient.auth.getSession();
      const userId = data.session?.user.id ?? null;
      await syncForUser(userId);
    })();

    const auth = supabaseClient.auth.onAuthStateChange((event, session) => {
      // Handle stale/expired refresh tokens gracefully
      if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED' && !session) {
        setElo(null);
        if (typeof window !== 'undefined' && window.location.pathname !== '/') {
          window.location.href = '/';
        }
        return;
      }
      void syncForUser(session?.user.id ?? null);
    });

    return () => {
      cancelled = true;
      auth.data.subscription.unsubscribe();
      if (profileChannel) supabaseClient.removeChannel(profileChannel);
    };
  }, []);

  async function signOut() {
    if (currentUserId) clearCachedProfile(currentUserId);
    else clearCachedProfile();
    setElo(null);
    await supabaseClient.auth.signOut();
    router.replace('/');
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
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        height: 'var(--navbar-height)',
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
