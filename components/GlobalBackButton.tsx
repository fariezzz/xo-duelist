"use client";

import React from 'react';
import { useRouter, usePathname } from 'next/navigation';

export default function GlobalBackButton() {
  const router = useRouter();
  const pathname = usePathname();

  // Pages where the "Back to Home" button should NOT be displayed
  const hideOnPaths = [
    '/',
    '/dashboard'
  ];

  const hideOnPrefixes = [
    '/game/',
    '/lobby/',
    '/matchmaking'
  ];

  if (!pathname) return null;

  const shouldHide = 
    hideOnPaths.includes(pathname) || 
    hideOnPrefixes.some(prefix => pathname.startsWith(prefix));

  if (shouldHide) return null;

  return (
    <div
      style={{
        position: 'relative',
        paddingTop: 'calc(var(--navbar-height, 60px) + 16px)',
        paddingLeft: '24px',
        paddingBottom: '16px',
        marginBottom: 'calc(-1 * (var(--navbar-height, 60px) + 16px))',
        zIndex: 10,
        pointerEvents: 'none', // Allow clicks to pass through empty space
      }}
    >
      <button
        onClick={() => router.push('/dashboard')}
        className="btn btn-secondary"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 16px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          pointerEvents: 'auto', // Re-enable clicks for the button
        }}
      >
        <svg 
          width="18" 
          height="18" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2" 
          strokeLinecap="round" 
          strokeLinejoin="round"
        >
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
        Back to Home
      </button>
    </div>
  );
}
