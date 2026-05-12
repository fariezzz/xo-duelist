"use client";
import React, { useEffect, useRef, useState } from "react";
import { Bot, Shield, Swords, Zap } from "lucide-react";

interface Props {
  open: boolean;
  myName: string;
  myElo: number;
  myAvatarUrl?: string | null;
  oppName: string;
  oppElo: number;
  oppAvatarUrl?: string | null;
  onCountdownDone: () => void;
  isVsAi?: boolean;
  aiEloMode?: "none" | "reduced";
}

type MatchFoundContentProps = Omit<Props, "open">;

export default function MatchFoundModal(props: Props) {
  const { open, ...contentProps } = props;

  if (!open) return null;

  return <MatchFoundModalContent {...contentProps} />;
}

function MatchFoundModalContent({
  myName,
  myElo,
  myAvatarUrl,
  oppName,
  oppElo,
  oppAvatarUrl,
  onCountdownDone,
  isVsAi,
  aiEloMode,
}: MatchFoundContentProps) {
  const [count, setCount] = useState(3);
  const onDoneRef = useRef(onCountdownDone);
  useEffect(() => { onDoneRef.current = onCountdownDone; }, [onCountdownDone]);

  useEffect(() => {
    if (count <= 0) {
      onDoneRef.current();
      return;
    }
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [count]);

  const eloDiff = oppElo - myElo;
  const diffLabel =
    eloDiff > 0
      ? `Opponent is +${eloDiff} ELO higher`
      : eloDiff < 0
        ? `Opponent is ${eloDiff} ELO lower`
        : "Same ELO rating";
  const HeaderIcon = isVsAi ? Bot : Swords;
  const OpponentFallbackIcon = isVsAi ? Bot : Shield;
  const EloImpactIcon = aiEloMode === "none" ? Shield : Zap;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 105,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.8)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        animation: "fade-in 0.3s ease-out",
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: "500px",
          width: "90%",
          padding: "36px 32px",
          textAlign: "center",
          animation: "scaleIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
          borderColor: "rgba(124,58,237,0.4)",
          boxShadow:
            "0 0 60px rgba(124,58,237,0.2), 0 0 120px rgba(245,158,11,0.1)",
        }}
      >
        {/* Header */}
        <div
          style={{
            fontFamily: "var(--font-heading)",
            fontWeight: 700,
            fontSize: "1rem",
            color: "#a78bfa",
            textTransform: "uppercase",
            letterSpacing: "0.15em",
            marginBottom: "24px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            width: "100%",
          }}
        >
          <HeaderIcon size={18} strokeWidth={2.4} aria-hidden="true" />
          <span>{isVsAi ? "AI Match Found!" : "Match Found!"}</span>
        </div>

        {/* VS Layout */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "20px",
            marginBottom: "20px",
          }}
        >
          {/* My side */}
          <div style={{ flex: 1, textAlign: "center" }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: myAvatarUrl
                  ? "transparent"
                  : "linear-gradient(135deg, rgba(124,58,237,0.3), rgba(124,58,237,0.1))",
                border: "2px solid rgba(124,58,237,0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.5rem",
                margin: "0 auto 8px",
                boxShadow: "0 0 20px rgba(124,58,237,0.2)",
                overflow: "hidden",
              }}
            >
              {myAvatarUrl ? (
                <img src={myAvatarUrl} alt={myName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <Swords size={28} strokeWidth={2.35} color="#ede9fe" aria-hidden="true" />
              )}
            </div>
            <div
              style={{
                fontFamily: "var(--font-heading)",
                fontWeight: 700,
                fontSize: "1rem",
                color: "var(--text-primary)",
                marginBottom: "2px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {myName}
            </div>
            <div
              style={{
                fontFamily: "var(--font-heading)",
                fontWeight: 600,
                fontSize: "0.85rem",
                color: "#a78bfa",
              }}
            >
              {myElo} ELO
            </div>
          </div>

          {/* VS */}
          <div
            style={{
              fontFamily: "var(--font-heading)",
              fontWeight: 700,
              fontSize: "1.8rem",
              color: "#fbbf24",
              textShadow: "0 0 20px rgba(245,158,11,0.4)",
              flexShrink: 0,
            }}
          >
            VS
          </div>

          {/* Opponent side */}
          <div style={{ flex: 1, textAlign: "center" }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: oppAvatarUrl
                  ? "transparent"
                  : "linear-gradient(135deg, rgba(245,158,11,0.3), rgba(245,158,11,0.1))",
                border: "2px solid rgba(245,158,11,0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.5rem",
                margin: "0 auto 8px",
                boxShadow: "0 0 20px rgba(245,158,11,0.2)",
                overflow: "hidden",
              }}
            >
              {oppAvatarUrl ? (
                <img src={oppAvatarUrl} alt={oppName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <OpponentFallbackIcon size={28} strokeWidth={2.35} color="#fde68a" aria-hidden="true" />
              )}
            </div>
            <div
              style={{
                fontFamily: "var(--font-heading)",
                fontWeight: 700,
                fontSize: "1rem",
                color: "var(--text-primary)",
                marginBottom: "2px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {oppName}
            </div>
            <div
              style={{
                fontFamily: "var(--font-heading)",
                fontWeight: 600,
                fontSize: "0.85rem",
                color: "#fbbf24",
              }}
            >
              {oppElo} ELO
            </div>
          </div>
        </div>

        {/* ELO diff */}
        <div
          style={{
            fontSize: "0.8rem",
            color: "var(--text-muted)",
            marginBottom: isVsAi ? '12px' : '24px',
          }}
        >
          {diffLabel}
        </div>

        {/* AI ELO policy badge */}
        {isVsAi && aiEloMode && (
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 14px',
            borderRadius: '6px',
            background: aiEloMode === "none" ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
            border: aiEloMode === "none" ? '1px solid rgba(16,185,129,0.2)' : '1px solid rgba(245,158,11,0.2)',
            marginBottom: '24px',
            fontSize: '0.78rem',
            fontFamily: 'var(--font-heading)',
            fontWeight: 600,
            color: aiEloMode === "none" ? '#10b981' : '#fbbf24',
          }}>
            <EloImpactIcon size={14} strokeWidth={2.35} aria-hidden="true" />
            <span>{aiEloMode === "none" ? "No ELO Impact" : "Small ELO Impact"}</span>
          </div>
        )}

        {/* Countdown */}
        <div
          style={{
            fontFamily: "var(--font-heading)",
            fontWeight: 700,
            fontSize: "1.1rem",
            color: "var(--text-muted)",
            marginBottom: "8px",
          }}
        >
          Match starting in
        </div>
        <div
          style={{
            fontFamily: "var(--font-heading)",
            fontWeight: 700,
            fontSize: "3rem",
            color: "#fbbf24",
            textShadow: "0 0 30px rgba(245,158,11,0.4)",
            lineHeight: 1,
          }}
        >
          {count}
        </div>
      </div>
    </div>
  );
}
