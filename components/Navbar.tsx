"use client";
import Link from 'next/link';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabaseClient } from '../lib/supabase';
import TierBadge from './TierBadge';
import { clearCachedProfile, getCachedProfile, setCachedProfile } from '../lib/profileCache';
import NotificationPanel from './NotificationPanel';

interface NavProfile {
  username: string;
  elo: number;
  avatarUrl: string | null;
}

type FriendRequestChangePayload = {
  new?: { status?: string } | null;
  old?: { status?: string } | null;
};

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const [profile, setProfile] = useState<NavProfile | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [notifCount, setNotifCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const handleNotifCountChange = useCallback((count: number) => {
    setNotifCount(count);
  }, []);

  useEffect(() => {
    setAvatarFailed(false);
  }, [profile?.avatarUrl]);

  useEffect(() => {
    let cancelled = false;
    let profileChannel: ReturnType<typeof supabaseClient.channel> | null = null;

    async function fetchProfileData(userId: string) {
      const { data, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (cancelled || !data) {
        if (error) console.warn('Navbar profile fetch error:', error.message);
        return;
      }
      setProfile({
        username: data.username ?? 'Player',
        elo: data.elo_rating ?? 1000,
        avatarUrl: data.avatar_url ?? null,
      });
      setCachedProfile(userId, data.elo_rating ?? 1000);
    }

    function mountProfileListener(userId: string) {
      if (profileChannel) supabaseClient.removeChannel(profileChannel);
      profileChannel = supabaseClient
        .channel(`profile-nav-${userId}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
          (payload: { new?: { elo_rating?: number; username?: string; avatar_url?: string | null } }) => {
            if (cancelled) return;
            const p = payload.new;
            if (!p) return;
            setProfile((prev) => ({
              username: p.username ?? prev?.username ?? 'Player',
              elo: p.elo_rating ?? prev?.elo ?? 1000,
              avatarUrl: p.avatar_url !== undefined ? p.avatar_url : prev?.avatarUrl ?? null,
            }));
            if (typeof p.elo_rating === 'number') setCachedProfile(userId, p.elo_rating);
          }
        )
        .subscribe();
    }

    async function syncForUser(userId: string | null) {
      setCurrentUserId(userId);
      if (!userId) {
        setProfile(null);
        setNotifCount(0);
        if (profileChannel) supabaseClient.removeChannel(profileChannel);
        profileChannel = null;
        return;
      }

      const cached = getCachedProfile(userId);
      if (cached) setProfile((prev) => prev ? { ...prev, elo: cached.elo } : null);
      await fetchProfileData(userId);
      if (cancelled) return;
      mountProfileListener(userId);
    }

    (async () => {
      const { data } = await supabaseClient.auth.getSession();
      const userId = data.session?.user.id ?? null;
      await syncForUser(userId);
    })();

    const auth = supabaseClient.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED' && !session) {
        setProfile(null);
        setNotifCount(0);
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

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setDropdownOpen(false);
        setNotifOpen(false);
      }
    }
    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  }, []);

  async function signOut() {
    if (currentUserId) clearCachedProfile(currentUserId);
    else clearCachedProfile();
    setProfile(null);
    setDropdownOpen(false);
    if (currentUserId) {
      await supabaseClient
        .from('profiles')
        .update({ status: 'offline', last_seen: new Date().toISOString() })
        .eq('id', currentUserId);
    }
    await supabaseClient.auth.signOut();
    router.replace('/');
  }

  // Avatar initials
  const initials = (profile?.username ?? '?')
    .split('_')
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2);

  const navLinkStyle: React.CSSProperties = {
    color: 'var(--text-muted)',
    textDecoration: 'none',
    fontSize: '0.9rem',
    fontWeight: 500,
    transition: 'color 0.2s',
    fontFamily: 'var(--font-heading)',
  };

  function navLinkColorFor(path: '/leaderboard' | '/history') {
    return pathname === path ? 'var(--text-primary)' : 'var(--text-muted)';
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
          padding: '0 16px',
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
            letterSpacing: '0.04em',
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
          }}
        >
          <span className="mobile-logo-text" style={{ fontSize: '1.5rem', color: '#7c3aed', textShadow: '0 0 20px rgba(124,58,237,0.4)' }}>X</span>
          <span className="mobile-logo-text" style={{ fontSize: '1.5rem', color: '#f59e0b', textShadow: '0 0 20px rgba(245,158,11,0.4)' }}>O</span>
          <span className="mobile-logo-text hidden-on-mobile" style={{ fontSize: '1.5rem', color: 'var(--text-primary)', marginLeft: '6px' }}>Duelist</span>
        </Link>

        {/* Right side */}
        <div className="nav-right-gap" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          {/* Nav links */}
          <Link
            href="/leaderboard"
            className="hidden-on-mobile"
            style={{ ...navLinkStyle, color: navLinkColorFor('/leaderboard') }}
            aria-current={pathname === '/leaderboard' ? 'page' : undefined}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = navLinkColorFor('/leaderboard'))}
          >
            Leaderboard
          </Link>
          <Link
            href="/history"
            className="hidden-on-mobile"
            style={{ ...navLinkStyle, color: navLinkColorFor('/history') }}
            aria-current={pathname === '/history' ? 'page' : undefined}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = navLinkColorFor('/history'))}
          >
            History
          </Link>

          {/* Notification Bell + separator + ELO */}
          {profile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {/* Bell with notification panel */}
              <div ref={notifRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => {
                    setNotifOpen((o) => !o);
                    setDropdownOpen(false);
                  }}
                  aria-label={notifCount > 0 ? `${notifCount} notifications` : 'No notifications'}
                  style={{
                    width: 28,
                    height: 28,
                    position: 'relative',
                    borderRadius: '8px',
                    border: 'none',
                    background: notifOpen ? 'rgba(124,58,237,0.15)' : 'transparent',
                    color: 'var(--text-primary)',
                    fontSize: '0.95rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    if (!notifOpen) e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                  }}
                  onMouseLeave={(e) => {
                    if (!notifOpen) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  {'\u{1F514}'}
                  {notifCount > 0 && (
                    <span
                      aria-hidden
                      style={{
                        position: 'absolute',
                        top: 0,
                        right: 0,
                        minWidth: 16,
                        height: 16,
                        borderRadius: '999px',
                        background: '#ef4444',
                        boxShadow: '0 0 0 2px rgba(10,15,30,0.9), 0 0 8px rgba(239,68,68,0.4)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.6rem',
                        fontFamily: 'var(--font-heading)',
                        fontWeight: 800,
                        color: '#fff',
                        padding: '0 4px',
                      }}
                    >
                      {notifCount > 9 ? '9+' : notifCount}
                    </span>
                  )}
                </button>

                {/* Notification Panel */}
                {currentUserId && (
                  <NotificationPanel
                    userId={currentUserId}
                    isOpen={notifOpen}
                    onClose={() => setNotifOpen(false)}
                    onCountChange={handleNotifCountChange}
                  />
                )}
              </div>

              <span
                aria-hidden
                style={{
                  width: 1,
                  height: 22,
                  background: 'rgba(255,255,255,0.2)',
                }}
              />

              <button
                onClick={() => {
                  setDropdownOpen(false);
                  setNotifOpen(false);
                  router.push('/profile');
                }}
                aria-label="Open profile from ELO"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '4px 6px',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <span
                  style={{
                    color: 'var(--accent-gold)',
                    fontFamily: 'var(--font-heading)',
                    fontWeight: 700,
                    fontSize: '0.95rem',
                  }}
                >
                  {profile.elo}
                </span>
                <TierBadge elo={profile.elo} />
              </button>
            </div>
          )}

          {/* User avatar + dropdown */}
          {profile && (
            <div ref={dropdownRef} style={{ position: 'relative' }}>
              <button
                onClick={() => { setDropdownOpen((o) => !o); setNotifOpen(false); }}
                aria-expanded={dropdownOpen}
                aria-haspopup="menu"
                aria-controls="nav-user-menu"
                aria-label="Open user menu"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: dropdownOpen ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '50px',
                  padding: '4px 14px 4px 4px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  if (!dropdownOpen) e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                }}
                onMouseLeave={(e) => {
                  if (!dropdownOpen) e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                }}
              >
                {/* Mini avatar */}
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    overflow: 'hidden',
                    background: profile.avatarUrl
                      ? 'transparent'
                      : 'linear-gradient(135deg, rgba(124,58,237,0.4), rgba(245,158,11,0.4))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    border: '2px solid rgba(124,58,237,0.3)',
                  }}
                >
                  {profile.avatarUrl && !avatarFailed ? (
                    <img
                      src={profile.avatarUrl}
                      alt=""
                      referrerPolicy="no-referrer"
                      onError={() => setAvatarFailed(true)}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.7rem', color: 'white' }}>
                      {initials}
                    </span>
                  )}
                </div>
                <span
                  className="nav-username"
                  style={{
                    fontFamily: 'var(--font-heading)',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    color: 'var(--text-primary)',
                    maxWidth: '100px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {profile.username}
                </span>
                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', transition: 'transform 0.2s', transform: dropdownOpen ? 'rotate(180deg)' : 'none' }}>
                  {'\u25BC'}
                </span>
              </button>

              {/* Dropdown */}
              {dropdownOpen && (
                <div
                  id="nav-user-menu"
                  role="menu"
                  aria-label="User navigation menu"
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    right: 0,
                    minWidth: '200px',
                    background: 'rgba(13, 21, 38, 0.98)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    backdropFilter: 'blur(20px)',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05)',
                    overflow: 'hidden',
                    animation: 'scaleIn 0.15s ease-out forwards',
                    transformOrigin: 'top right',
                  }}
                >
                  <DropdownItem icon={'\u{1F464}'} label="My Profile" active={pathname === '/profile'} onClick={() => { setDropdownOpen(false); router.push('/profile'); }} />
                  <DropdownItem icon={'\u{1F3E0}'} label="Home" active={pathname === '/dashboard'} onClick={() => { setDropdownOpen(false); router.push('/dashboard'); }} />
                  <DropdownItem icon={'\u{1F3C6}'} label="Leaderboard" active={pathname === '/leaderboard'} onClick={() => { setDropdownOpen(false); router.push('/leaderboard'); }} />
                  <DropdownItem icon={'\u{1F4DC}'} label="Match History" active={pathname === '/history'} onClick={() => { setDropdownOpen(false); router.push('/history'); }} />
                  <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />
                  <DropdownItem icon={'\u{1F6AA}'} label="Logout" onClick={signOut} danger />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

// ── Dropdown Item ──────────────────────────────────
function DropdownItem({
  icon,
  label,
  onClick,
  danger,
  active,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      role="menuitem"
      aria-current={active ? 'page' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        width: '100%',
        padding: '10px 16px',
        background: 'transparent',
        border: 'none',
        color: danger ? '#ef4444' : active ? '#ffffff' : 'var(--text-primary)',
        fontFamily: 'var(--font-heading)',
        fontWeight: active ? 700 : 500,
        fontSize: '0.88rem',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = danger ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.06)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <span style={{ fontSize: '1rem', width: '20px', textAlign: 'center' }}>{icon}</span>
      {label}
    </button>
  );
}
