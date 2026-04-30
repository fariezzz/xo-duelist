"use client";
import React, { useEffect, useRef, useState } from "react";

interface Props {
  open: boolean;
  myName: string;
  myElo: number;
  myAvatarUrl?: string | null;
  oppName: string;
  oppElo: number;
  oppAvatarUrl?: string | null;
  onCountdownDone: () => void;
}

export default function MatchFoundModal({
  open,
  myName,
  myElo,
  myAvatarUrl,
  oppName,
  oppElo,
  oppAvatarUrl,
  onCountdownDone,
}: Props) {
  const [count, setCount] = useState(3);
  const onDoneRef = useRef(onCountdownDone);
  useEffect(() => { onDoneRef.current = onCountdownDone; }, [onCountdownDone]);

  useEffect(() => {
    if (!open) {
      setCount(3);
      return;
    }
    if (count <= 0) {
      onDoneRef.current();
      return;
    }
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [open, count]);

  if (!open) return null;

  const eloDiff = oppElo - myElo;
  const diffLabel =
    eloDiff > 0
      ? `Opponent is +${eloDiff} ELO higher`
      : eloDiff < 0
        ? `Opponent is ${eloDiff} ELO lower`
        : "Same ELO rating";

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
          }}
        >
          ⚔️ Match Found!
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
                "⚔️"
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
                "🛡️"
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
            marginBottom: "24px",
          }}
        >
          {diffLabel}
        </div>

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
