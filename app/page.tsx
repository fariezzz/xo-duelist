"use client";
import React, { useState } from 'react';
import { supabaseClient } from '../lib/supabase';
import { useRouter } from 'next/navigation';

export default function Home() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    if (mode === 'register') {
      const { error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: { data: { username } },
      });
      if (error) {
        alert(error.message);
        setLoading(false);
        return;
      }
    } else {
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) {
        alert(error.message);
        setLoading(false);
        return;
      }
    }
    router.push('/dashboard');
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
          padding: '40px 36px',
          margin: '20px',
        }}
      >
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
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

        {/* Mode Toggle */}
        <div
          style={{
            display: 'flex',
            borderRadius: '10px',
            background: 'rgba(255,255,255,0.04)',
            padding: '3px',
            marginBottom: '24px',
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
          <input
            className="input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button
            type="submit"
            className={`btn btn-lg ${mode === 'login' ? 'btn-primary' : 'btn-secondary'}`}
            disabled={loading}
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
