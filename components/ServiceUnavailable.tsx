"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSupabaseHealth } from "../lib/supabaseHealth";

const MIN_RETRY_FEEDBACK_MS = 650;

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/**
 * Full-screen overlay that blocks the entire app when Supabase is unavailable.
 *
 * All critical layout styles are INLINE to guarantee they apply regardless of
 * CSS loading order or Tailwind/PostCSS processing issues.
 */
export default function ServiceUnavailable() {
  const { status: healthStatus, recheck } = useSupabaseHealth();
  const [retrying, setRetrying] = useState(false);
  const [backOnline, setBackOnline] = useState(false);
  const wasUnavailableRef = useRef(false);

  // Track when we've been in "unavailable" state
  useEffect(() => {
    if (healthStatus === "unavailable") {
      wasUnavailableRef.current = true;
    }
  }, [healthStatus]);

  // Auto-retry detection: when the background poll detects availability,
  // healthStatus transitions from "unavailable" → "available". Trigger the
  // same reload flow as the manual "Try Again" button.
  useEffect(() => {
    if (healthStatus === "available" && wasUnavailableRef.current && !backOnline) {
      setBackOnline(true);
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    }
  }, [healthStatus, backOnline]);

  const handleRetry = useCallback(async () => {
    setRetrying(true);
    const startedAt = Date.now();
    try {
      const result = await recheck();
      const remainingMs = MIN_RETRY_FEEDBACK_MS - (Date.now() - startedAt);
      if (remainingMs > 0) {
        await wait(remainingMs);
      }

      if (result === "available") {
        setBackOnline(true);
        setTimeout(() => {
          window.location.reload();
        }, 1500);
        return;
      }
    } finally {
      setRetrying(false);
    }
  }, [recheck]);

  // During initial "checking" on first load, don't show overlay
  if (healthStatus === "checking") {
    return null;
  }

  // Don't render anything when service is available (and not transitioning)
  if (healthStatus === "available" && !backOnline) {
    return null;
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "rgba(5, 8, 18, 0.95)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
      }}
    >
      <div
        style={{
          width: "min(420px, 100%)",
          maxHeight: "calc(100vh - 32px)",
          overflowY: "auto",
          textAlign: "center",
          padding: "34px 28px 30px",
          borderRadius: 16,
          border: backOnline ? "1px solid rgba(16, 185, 129, 0.25)" : "1px solid rgba(124, 58, 237, 0.18)",
          background: "rgba(255, 255, 255, 0.03)",
          boxShadow: backOnline
            ? "0 8px 40px rgba(16, 185, 129, 0.15), inset 0 1px 0 rgba(255,255,255,0.04)"
            : "0 8px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)",
          animation: "svc-overlay-in 0.6s ease-out forwards",
          transition: "border-color 0.4s ease, box-shadow 0.4s ease",
        }}
      >
        {backOnline ? (
          /* ── Success: Server is back online ── */
          <div style={{ padding: "12px 0" }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "rgba(16, 185, 129, 0.1)",
                border: "2px solid rgba(16, 185, 129, 0.3)",
                marginBottom: 18,
                animation: "svc-overlay-in 0.4s ease-out forwards",
              }}
            >
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#10b981"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h1
              style={{
                fontFamily: "var(--font-heading, 'Rajdhani', sans-serif)",
                fontWeight: 700,
                fontSize: "1.55rem",
                margin: "0 0 10px",
                color: "#10b981",
                lineHeight: 1.2,
              }}
            >
              Server is Back Online!
            </h1>
            <p
              style={{
                color: "#94a3b8",
                fontSize: "0.9rem",
                margin: "0 0 16px",
              }}
            >
              Reloading the page...
            </p>
            <div
              style={{
                display: "inline-block",
                width: 18,
                height: 18,
                border: "2px solid rgba(16,185,129,0.3)",
                borderTopColor: "#10b981",
                borderRadius: "50%",
                animation: "spin-slow 0.8s linear infinite",
              }}
            />
          </div>
        ) : (
          <>
        {/* Animated Server Icon */}
        <div
          style={{
            position: "relative",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 20,
            width: 76,
            height: 76,
          }}
        >
          {/* Pulsing ring */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              border: "2px solid rgba(239, 68, 68, 0.25)",
              animation: "svc-ring-pulse 2.5s ease-in-out infinite",
            }}
          />
          <svg
            viewBox="0 0 64 64"
            width="52"
            height="52"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            style={{
              position: "relative",
              zIndex: 1,
              filter: "drop-shadow(0 0 14px rgba(124,58,237,0.35))",
            }}
          >
            {/* Server body */}
            <rect x="10" y="8" width="44" height="16" rx="4" fill="rgba(124,58,237,0.15)" stroke="#7c3aed" strokeWidth="2" />
            <rect x="10" y="28" width="44" height="16" rx="4" fill="rgba(124,58,237,0.10)" stroke="#7c3aed" strokeWidth="2" />
            <rect x="10" y="48" width="44" height="8" rx="3" fill="rgba(124,58,237,0.06)" stroke="rgba(124,58,237,0.4)" strokeWidth="1.5" />
            {/* Status lights (offline red) */}
            <circle cx="20" cy="16" r="2.5" fill="#ef4444">
              <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite" />
            </circle>
            <circle cx="20" cy="36" r="2.5" fill="#ef4444">
              <animate attributeName="opacity" values="1;0.3;1" dur="2s" begin="0.3s" repeatCount="indefinite" />
            </circle>
            {/* Drive slots */}
            <rect x="30" y="13" width="18" height="3" rx="1" fill="rgba(255,255,255,0.08)" />
            <rect x="30" y="18" width="12" height="2" rx="1" fill="rgba(255,255,255,0.05)" />
            <rect x="30" y="33" width="18" height="3" rx="1" fill="rgba(255,255,255,0.08)" />
            <rect x="30" y="38" width="12" height="2" rx="1" fill="rgba(255,255,255,0.05)" />
            {/* X mark */}
            <line x1="20" y1="20" x2="44" y2="44" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" opacity="0.7" />
            <line x1="44" y1="20" x2="20" y2="44" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" opacity="0.7" />
          </svg>
        </div>

        {/* Title */}
        <h1
          style={{
            fontFamily: "var(--font-heading, 'Rajdhani', sans-serif)",
            fontWeight: 700,
            fontSize: "1.65rem",
            letterSpacing: "0.01em",
            margin: "0 0 10px",
            color: "#f1f5f9",
            lineHeight: 1.2,
          }}
        >
          <span style={{ color: "#7c3aed", textShadow: "0 0 24px rgba(124,58,237,0.5)" }}>
            Server
          </span>{" "}
          Unavailable
        </h1>

        {/* Description */}
        <p
          style={{
            color: "#94a3b8",
            fontSize: "0.9rem",
            lineHeight: 1.55,
            margin: "0 auto 18px",
            maxWidth: 340,
          }}
        >
          Our server is currently in sleep mode or under maintenance.
          <br />
          This usually happens when the service hasn&apos;t been used for a while.
        </p>

        {/* Info badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            maxWidth: "100%",
            padding: "7px 12px",
            borderRadius: 8,
            background: "rgba(245, 158, 11, 0.08)",
            border: "1px solid rgba(245, 158, 11, 0.18)",
            color: "#fbbf24",
            fontSize: "0.76rem",
            lineHeight: 1.25,
            fontFamily: "var(--font-heading, 'Rajdhani', sans-serif)",
            fontWeight: 600,
            marginBottom: 22,
          }}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span>The server will automatically wake up — please wait a moment</span>
        </div>

        {/* Retry Button */}
        <div>
          <button
            type="button"
            onClick={() => void handleRetry()}
            disabled={retrying}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              width: "100%",
              maxWidth: 230,
              padding: "12px 20px",
              borderRadius: 12,
              border: "none",
              fontFamily: "var(--font-heading, 'Rajdhani', sans-serif)",
              fontWeight: 700,
              fontSize: "0.98rem",
              letterSpacing: "0.02em",
              cursor: retrying ? "wait" : "pointer",
              color: "white",
              background: retrying
                ? "rgba(124, 58, 237, 0.25)"
                : "linear-gradient(135deg, #7c3aed 0%, #6d28d9 50%, #7c3aed 100%)",
              boxShadow: retrying ? "none" : "0 4px 24px rgba(124, 58, 237, 0.4)",
              transition: "all 0.25s ease",
              opacity: retrying ? 0.7 : 1,
            }}
          >
            {retrying ? (
              <>
                <span
                  style={{
                    display: "inline-block",
                    width: 16,
                    height: 16,
                    border: "2px solid rgba(255,255,255,0.3)",
                    borderTopColor: "white",
                    borderRadius: "50%",
                    animation: "spin-slow 0.8s linear infinite",
                  }}
                />
                Checking...
              </>
            ) : (
              <>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                Try Again
              </>
            )}
          </button>
        </div>

        {/* Contact Admin via WhatsApp */}
        <a
          href="https://wa.me/6281294485241?text=Halo%20Admin%2C%20server%20XO%20Duelist%20sedang%20tidak%20aktif.%20Mohon%20bantuannya."
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            width: "100%",
            maxWidth: 230,
            padding: "11px 20px",
            marginTop: 10,
            borderRadius: 12,
            border: "1px solid rgba(37, 211, 102, 0.3)",
            background: "rgba(37, 211, 102, 0.08)",
            fontFamily: "var(--font-heading, 'Rajdhani', sans-serif)",
            fontWeight: 600,
            fontSize: "0.9rem",
            letterSpacing: "0.02em",
            cursor: "pointer",
            color: "#25d366",
            textDecoration: "none",
            transition: "all 0.25s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(37, 211, 102, 0.15)";
            e.currentTarget.style.borderColor = "rgba(37, 211, 102, 0.5)";
            e.currentTarget.style.boxShadow = "0 0 20px rgba(37, 211, 102, 0.15)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(37, 211, 102, 0.08)";
            e.currentTarget.style.borderColor = "rgba(37, 211, 102, 0.3)";
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
          Contact Admin
        </a>

        {/* Auto retry indicator */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            marginTop: 16,
            color: "#94a3b8",
            fontSize: "0.73rem",
            fontFamily: "var(--font-heading, 'Rajdhani', sans-serif)",
            fontWeight: 500,
            letterSpacing: "0.04em",
            opacity: 0.7,
          }}
        >
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#10b981",
              animation: "svc-dot-blink 2s ease-in-out infinite",
            }}
          />
          Auto-retrying every 15 seconds
        </div>
          </>
        )}
      </div>

      {/* Keyframe animations embedded via style tag */}
      <style>{`
        @keyframes svc-overlay-in {
          from { opacity: 0; transform: scale(0.96); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes svc-ring-pulse {
          0%, 100% { transform: scale(1); opacity: 0.6; box-shadow: 0 0 20px rgba(239,68,68,0.1); }
          50%      { transform: scale(1.15); opacity: 0.2; box-shadow: 0 0 40px rgba(239,68,68,0.2); }
        }
        @keyframes svc-dot-blink {
          0%, 100% { opacity: 0.3; box-shadow: 0 0 4px rgba(16,185,129,0.2); }
          50%      { opacity: 1; box-shadow: 0 0 8px rgba(16,185,129,0.6); }
        }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
