"use client";

import React from "react";

type SuccessChallengeModalProps = {
  open: boolean;
  username: string;
  onClose: () => void;
};

export default function SuccessChallengeModal({
  open,
  username,
  onClose,
}: SuccessChallengeModalProps) {
  if (!open) return null;

  return (
    <div className="ccm-backdrop" role="presentation" onClick={onClose}>
      <div
        className="ccm-card card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ccm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="ccm-title" className="ccm-title">
          ✅ Challenge Sent!
        </h2>
        <p className="ccm-body">
          Game invite successfully sent to <strong>{username}</strong>. They will receive a notification and can join from their Dashboard or Friends list.
        </p>
        <div className="ccm-actions">
          <button type="button" className="btn btn-primary" onClick={onClose} style={{ minHeight: '32px', padding: '0 16px', fontSize: '13px' }}>
            Got it
          </button>
        </div>
      </div>

      <style jsx>{`
        .ccm-backdrop {
          position: fixed;
          inset: 0;
          z-index: 200;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background: rgba(10, 15, 30, 0.72);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          transition: opacity 0.2s ease;
        }

        .ccm-card {
          width: min(400px, 100%);
          padding: 22px;
          border-color: rgba(34, 197, 94, 0.28);
          background: var(--bg-layer-2);
          transition: transform 0.2s ease, border-color 0.2s ease;
        }

        .ccm-title {
          margin: 0 0 10px;
          font-family: var(--font-heading);
          font-size: 1.25rem;
          font-weight: 700;
          color: #22c55e;
        }

        .ccm-body {
          margin: 0 0 18px;
          color: rgba(226, 232, 240, 0.82);
          font-size: 0.92rem;
          line-height: 1.45;
        }

        .ccm-body strong {
          color: #f8fafc;
        }

        .ccm-actions {
          display: flex;
          justify-content: flex-end;
        }
      `}</style>
    </div>
  );
}
