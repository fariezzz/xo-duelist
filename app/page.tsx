"use client";
import React, { useEffect, useState } from 'react';
import { supabaseClient, setRememberMe } from '../lib/supabase';
import { getAuthRedirectUrl } from '../lib/auth-redirect';
import { useRouter } from 'next/navigation';
import { useNotification } from '../hooks/useNotification';
import { Eye, EyeOff } from 'lucide-react';

type OAuthProvider = 'google' | 'github' | 'discord';

const OAUTH_PROVIDERS: { id: OAuthProvider; label: string; icon: React.ReactNode; color: string; hoverColor: string }[] = [
  {
    id: 'google',
    label: 'Google',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        <path d="M1 1h22v22H1z" fill="none"/>
      </svg>
    ),
    color: 'rgba(234,67,53,0.12)',
    hoverColor: 'rgba(234,67,53,0.22)'
  },
  {
    id: 'github',
    label: 'GitHub',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
        <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.022A9.607 9.607 0 0 1 12 6.82c.85.004 1.705.114 2.504.336 1.909-1.29 2.747-1.022 2.747-1.022.546 1.379.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
      </svg>
    ),
    color: 'rgba(255,255,255,0.06)',
    hoverColor: 'rgba(255,255,255,0.12)'
  },
  {
    id: 'discord',
    label: 'Discord',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
      </svg>
    ),
    color: 'rgba(88,101,242,0.12)',
    hoverColor: 'rgba(88,101,242,0.22)'
  },
];

export default function Home() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [rememberMe, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const { showToast } = useNotification();

  // Redirect to dashboard if already logged in
  useEffect(() => {
    (async () => {
      const { data } = await supabaseClient.auth.getSession();
      if (data.session) {
        router.replace('/dashboard');
      } else {
        setCheckingSession(false);
      }
    })();
  }, [router]);

  // Show callback status messages
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('error') === 'auth_callback_failed') {
      showToast({ type: 'error', title: 'Login Failed', message: 'OAuth authentication failed. Please try again.' });
      window.history.replaceState({}, '', '/');
      return;
    }
    if (params.get('password_set') === '1') {
      showToast({
        type: 'success',
        title: 'Password Created',
        message: 'You can now sign in with email + password.',
      });
      window.history.replaceState({}, '', '/');
    }
  }, [showToast]);

  useEffect(() => {
    const { data: auth } = supabaseClient.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        router.replace('/auth/update-password');
      }
    });

    return () => {
      auth.subscription.unsubscribe();
    };
  }, [router]);

  // Don't render the form while checking session
  if (checkingSession) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setRememberMe(rememberMe);

    if (mode === 'register') {
      const emailRedirectTo = getAuthRedirectUrl('/auth/callback');
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          data: { username },
          ...(emailRedirectTo ? { emailRedirectTo } : {}),
        },
      });
      if (error) {
        showToast({ type: 'error', title: 'Registration Failed', message: error.message });
        setLoading(false);
        return;
      }
      if (data.session?.user.id) {
        await supabaseClient
          .from('profiles')
          .update({ status: 'online', last_seen: new Date().toISOString() })
          .eq('id', data.session.user.id);
      }
    } else {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) {
        showToast({ type: 'error', title: 'Login Failed', message: error.message });
        setLoading(false);
        return;
      }
      if (data.session?.user.id) {
        await supabaseClient
          .from('profiles')
          .update({ status: 'online', last_seen: new Date().toISOString() })
          .eq('id', data.session.user.id);
      }
    }
    router.push('/dashboard');
  }

  async function handleOAuth(provider: OAuthProvider) {
    setOauthLoading(provider);
    try {
      const redirectTo = getAuthRedirectUrl('/auth/callback');
      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider,
        options: {
          ...(redirectTo ? { redirectTo } : {}),
        },
      });
      if (error) {
        showToast({ type: 'error', title: 'OAuth Failed', message: error.message });
        setOauthLoading(null);
      }
      // Browser will redirect — loading stays on
    } catch {
      showToast({ type: 'error', title: 'OAuth Failed', message: 'Could not initiate login.' });
      setOauthLoading(null);
    }
  }

  return (
    <div
      className="page-container"
      style={{
        paddingTop: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
      }}
    >
      <div
        className="card animate-fade-in"
        style={{
          width: '100%',
          maxWidth: '440px',
          padding: '32px 32px',
          margin: '20px',
        }}
      >
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <h1
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 700,
              fontSize: '2.8rem',
              marginBottom: '8px',
              lineHeight: 1.1,
            }}
          >
            <span style={{ color: '#7c3aed', textShadow: '0 0 30px rgba(124,58,237,0.5)' }}>X</span>
            <span style={{ color: '#f59e0b', textShadow: '0 0 30px rgba(245,158,11,0.5)' }}>O</span>
            <span style={{ color: 'var(--text-primary)', marginLeft: '8px' }}>Duelist</span>
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: 1.5 }}>
            Competitive 5×5 Tic Tac Toe — climb the ELO ladder and prove your dominance.
          </p>
        </div>

        {/* OAuth Buttons */}
        <div style={{ display: 'flex', flexDirection: 'row', gap: '8px', marginBottom: '16px' }}>
          {OAUTH_PROVIDERS.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={!!oauthLoading || loading}
              onClick={() => handleOAuth(p.id)}
              title={`Continue with ${p.label}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                flex: 1,
                padding: '10px 0',
                borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.08)',
                background: oauthLoading === p.id ? p.hoverColor : p.color,
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-heading)',
                fontWeight: 600,
                fontSize: '0.9rem',
                cursor: oauthLoading ? 'wait' : 'pointer',
                transition: 'all 0.2s',
                opacity: oauthLoading && oauthLoading !== p.id ? 0.4 : 1,
              }}
              onMouseEnter={(e) => {
                if (!oauthLoading) e.currentTarget.style.background = p.hoverColor;
              }}
              onMouseLeave={(e) => {
                if (!oauthLoading) e.currentTarget.style.background = oauthLoading === p.id ? p.hoverColor : p.color;
              }}
            >
              {oauthLoading === p.id ? (
                <span className="animate-spin-slow" style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%' }} />
              ) : (
                <span style={{ fontSize: '1.1rem' }}>{p.icon}</span>
              )}
              {p.label}
            </button>
          ))}
        </div>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)' }} />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontFamily: 'var(--font-heading)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            or
          </span>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)' }} />
        </div>

        {/* Mode Toggle */}
        <div
          style={{
            display: 'flex',
            borderRadius: '10px',
            background: 'rgba(255,255,255,0.04)',
            padding: '3px',
            marginBottom: '16px',
          }}
        >
          <button
            type="button"
            onClick={() => setMode('login')}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: '8px',
              border: 'none',
              fontFamily: 'var(--font-heading)',
              fontWeight: 600,
              fontSize: '0.95rem',
              cursor: 'pointer',
              transition: 'all 0.2s',
              background: mode === 'login' ? 'rgba(124,58,237,0.2)' : 'transparent',
              color: mode === 'login' ? '#a78bfa' : 'var(--text-muted)',
            }}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => setMode('register')}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: '8px',
              border: 'none',
              fontFamily: 'var(--font-heading)',
              fontWeight: 600,
              fontSize: '0.95rem',
              cursor: 'pointer',
              transition: 'all 0.2s',
              background: mode === 'register' ? 'rgba(245,158,11,0.2)' : 'transparent',
              color: mode === 'register' ? '#fbbf24' : 'var(--text-muted)',
            }}
          >
            Register
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {mode === 'register' && (
            <input
              className="input"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          )}
          <input
            className="input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <div style={{ position: 'relative' }}>
            <input
              className="input"
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{ paddingRight: '44px' }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              title={showPassword ? 'Hide password' : 'Show password'}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4px',
                border: 'none',
                background: 'transparent',
                color: 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
            </button>
          </div>

          {/* Remember Me */}
          {mode === 'login' && (
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                cursor: 'pointer',
                userSelect: 'none',
                fontSize: '0.9rem',
                color: 'var(--text-muted)',
                padding: '4px 0',
              }}
            >
              <div
                onClick={() => setRemember(!rememberMe)}
                style={{
                  width: 38,
                  height: 20,
                  borderRadius: '10px',
                  background: rememberMe
                    ? 'linear-gradient(135deg, #7c3aed, #a78bfa)'
                    : 'rgba(255,255,255,0.1)',
                  position: 'relative',
                  transition: 'background 0.25s ease',
                  flexShrink: 0,
                  boxShadow: rememberMe
                    ? '0 0 12px rgba(124,58,237,0.3)'
                    : 'none',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: '2px',
                    left: rememberMe ? '20px' : '2px',
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    background: 'white',
                    transition: 'left 0.25s ease',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                  }}
                />
              </div>
              <span>Remember me</span>
            </label>
          )}

          <button
            type="submit"
            className={`btn btn-lg ${mode === 'login' ? 'btn-primary' : 'btn-secondary'}`}
            disabled={loading || !!oauthLoading}
            style={{ width: '100%', marginTop: '8px' }}
          >
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="animate-spin-slow" style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%' }} />
                Processing...
              </span>
            ) : mode === 'login' ? (
              <>⚔️ Enter Arena</>
            ) : (
              <>✨ Create Account</>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
