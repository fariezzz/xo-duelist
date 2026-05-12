"use client";

import React from "react";
import { Swords } from "lucide-react";

type ArenaCardProps = {
  onStartMatch: () => void;
  disabled?: boolean;
};

export default function ArenaCard({ onStartMatch, disabled = false }: ArenaCardProps) {
  return (
    <section className="arena-card">
      <div className="arena-overlay" aria-hidden="true" />

      <div className="arena-copy">
        <span className="arena-mode-pill">MAIN MODE</span>
        <h2>Enter the Arena</h2>
        <p>Start a ranked real-time match against another player.</p>
      </div>

      <button className="arena-start-btn" onClick={onStartMatch} disabled={disabled} aria-label="Start ranked match">
        <span className="arena-ring" />
        <span className="arena-core">
          <span className="arena-icon">
            <Swords strokeWidth={2.35} aria-hidden="true" />
          </span>
          <span className="arena-start-text">START</span>
          <span className="arena-start-subtext">MATCH</span>
        </span>
      </button>

      <style jsx>{`
        .arena-card {
          position: relative;
          height: 100%;
          border-radius: 12px;
          border: 1px solid rgba(124, 58, 237, 0.26);
          background:
            radial-gradient(500px 260px at 16% 32%, rgba(124, 58, 237, 0.24) 0%, transparent 60%),
            radial-gradient(460px 240px at 82% 72%, rgba(245, 158, 11, 0.16) 0%, transparent 60%),
            linear-gradient(135deg, rgba(24, 18, 58, 0.9), rgba(11, 18, 38, 0.96));
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          padding: 16px 28px;
          overflow: hidden;
          isolation: isolate;
        }

        .arena-overlay {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: radial-gradient(circle at center, rgba(124, 58, 237, 0.14) 0%, transparent 68%);
          z-index: 0;
        }

        .arena-copy {
          position: relative;
          z-index: 1;
          max-width: 54%;
        }

        .arena-mode-pill {
          display: inline-flex;
          align-items: center;
          height: 28px;
          border-radius: 999px;
          padding: 0 12px;
          background: rgba(245, 158, 11, 0.18);
          border: 1px solid rgba(245, 158, 11, 0.35);
          color: #fbbf24;
          font-family: var(--font-heading);
          font-size: 0.95rem;
          font-weight: 700;
          letter-spacing: 0.06em;
        }

        .arena-copy h2 {
          margin: 16px 0 8px;
          font-family: var(--font-heading);
          font-size: clamp(2rem, 3.3vw, 3.6rem);
          line-height: 0.95;
          color: #f8fafc;
          text-wrap: balance;
          text-shadow: 0 0 24px rgba(124, 58, 237, 0.18);
        }

        .arena-copy p {
          margin: 0;
          max-width: 460px;
          color: #94a3b8;
          font-size: 1.5rem;
          line-height: 1.3;
        }

        .arena-start-btn {
          position: relative;
          width: 140px;
          height: 140px;
          border-radius: 999px;
          border: none;
          background: transparent;
          display: grid;
          place-items: center;
          cursor: pointer;
          z-index: 1;
          transition: transform 0.2s ease, opacity 0.2s ease;
        }

        .arena-start-btn:hover:not(:disabled) {
          transform: translateY(-2px) scale(1.01);
        }

        .arena-start-btn:disabled {
          cursor: not-allowed;
          opacity: 0.65;
        }

        .arena-ring {
          position: absolute;
          inset: -8px;
          border-radius: 999px;
          border: 4px solid transparent;
          border-top-color: rgba(124, 58, 237, 0.95);
          border-right-color: rgba(245, 158, 11, 0.8);
          animation: spin-ring 5s linear infinite;
          filter: drop-shadow(0 0 14px rgba(124, 58, 237, 0.55));
        }

        .arena-core {
          width: 126px;
          height: 126px;
          border-radius: 999px;
          border: 2px solid rgba(255, 255, 255, 0.2);
          background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 58%, #f59e0b 130%);
          box-shadow:
            0 0 0 6px rgba(124, 58, 237, 0.2),
            0 0 26px rgba(124, 58, 237, 0.5),
            0 0 50px rgba(124, 58, 237, 0.3);
          animation: pulse-core 2.2s ease-in-out infinite;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2px;
        }

        .arena-icon {
          width: 2rem;
          height: 2rem;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #ede9fe;
          transform: translateY(-2px);
        }

        .arena-icon :global(svg) {
          width: 100%;
          height: 100%;
        }

        .arena-start-text {
          font-family: var(--font-heading);
          font-size: 2rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          color: #fff;
          line-height: 1;
        }

        .arena-start-subtext {
          font-family: var(--font-heading);
          font-size: 0.9rem;
          font-weight: 600;
          letter-spacing: 0.18em;
          color: rgba(255, 255, 255, 0.9);
          line-height: 1;
        }

        @keyframes spin-ring {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes pulse-core {
          0%,
          100% {
            box-shadow:
              0 0 0 6px rgba(124, 58, 237, 0.2),
              0 0 26px rgba(124, 58, 237, 0.5),
              0 0 50px rgba(124, 58, 237, 0.3);
          }
          50% {
            box-shadow:
              0 0 0 8px rgba(124, 58, 237, 0.28),
              0 0 32px rgba(124, 58, 237, 0.6),
              0 0 64px rgba(124, 58, 237, 0.42);
          }
        }

        @media (max-width: 1280px) {
          .arena-copy h2 {
            font-size: clamp(1.8rem, 3vw, 3rem);
          }

          .arena-copy p {
            font-size: 1.35rem;
          }
        }

        @media (max-width: 900px) {
          .arena-card {
            padding: 14px 20px;
            gap: 14px;
          }

          .arena-copy {
            max-width: 60%;
          }

          .arena-copy h2 {
            margin-top: 12px;
          }

          .arena-copy p {
            font-size: 1.2rem;
          }

          .arena-start-btn {
            width: 120px;
            height: 120px;
          }

          .arena-core {
            width: 108px;
            height: 108px;
          }

          .arena-icon {
            width: 1.65rem;
            height: 1.65rem;
          }

          .arena-start-text {
            font-size: 1.65rem;
          }
        }

        @media (max-width: 768px) {
          .arena-card {
            min-height: unset;
            padding: 12px 14px;
            flex-direction: column;
            align-items: flex-start;
            justify-content: flex-start;
            gap: 8px;
            height: auto;
          }

          .arena-copy {
            max-width: 100%;
          }

          .arena-copy h2 {
            margin: 8px 0 4px;
            font-size: clamp(1.7rem, 7vw, 2.1rem);
          }

          .arena-copy p {
            font-size: 0.9rem;
            line-height: 1.25;
            max-width: 100%;
          }

          .arena-start-btn {
            width: 98px;
            height: 98px;
            align-self: center;
            margin-top: 0;
          }

          .arena-core {
            width: 88px;
            height: 88px;
          }

          .arena-ring {
            inset: -6px;
            border-width: 3px;
          }

          .arena-icon {
            width: 1.2rem;
            height: 1.2rem;
          }

          .arena-start-text {
            font-size: 1.1rem;
          }

          .arena-start-subtext {
            font-size: 0.62rem;
            letter-spacing: 0.12em;
          }

          .arena-mode-pill {
            height: 24px;
            padding: 0 10px;
            font-size: 0.78rem;
          }
        }
      `}</style>
    </section>
  );
}
