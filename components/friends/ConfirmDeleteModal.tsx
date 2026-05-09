"use client";

import React from "react";

type ConfirmDeleteModalProps = {
  open: boolean;
  username: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function ConfirmDeleteModal({
  open,
  username,
  loading = false,
  onCancel,
  onConfirm,
}: ConfirmDeleteModalProps) {
  if (!open) return null;

  return (
    <div className="cdm-backdrop" role="presentation" onClick={loading ? undefined : onCancel}>
      <div
        className="cdm-card card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cdm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="cdm-title" className="cdm-title">
          Remove friend?
        </h2>
        <p className="cdm-body">
          Remove <strong>{username}</strong> from your friends list? You can send a new request later.
        </p>
        <div className="cdm-actions">
          <button type="button" className="btn btn-ghost cdm-btn" disabled={loading} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn cdm-danger" disabled={loading} onClick={onConfirm}>
            {loading ? "Removing…" : "Remove"}
          </button>
        </div>
      </div>

      <style jsx>{`
        .cdm-backdrop {
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

        .cdm-card {
          width: min(400px, 100%);
          padding: 22px;
          border-color: rgba(239, 68, 68, 0.28);
          transition: transform 0.2s ease, border-color 0.2s ease;
        }

        .cdm-title {
          margin: 0 0 10px;
          font-family: var(--font-heading);
          font-size: 1.25rem;
          font-weight: 700;
          color: #f8fafc;
        }

        .cdm-body {
          margin: 0 0 18px;
          color: rgba(226, 232, 240, 0.82);
          font-size: 0.92rem;
          line-height: 1.45;
        }

        .cdm-body strong {
          color: #f8fafc;
        }

        .cdm-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          flex-wrap: wrap;
        }

        .cdm-btn {
          min-height: 32px;
          padding: 0 12px;
          font-size: 12px;
        }

        .cdm-danger {
          min-height: 32px;
          padding: 0 12px;
          font-size: 12px;
          background: linear-gradient(135deg, #dc2626, #b91c1c);
          color: white;
          border: none;
          border-radius: 10px;
          font-family: var(--font-heading);
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.2s ease, transform 0.2s ease;
        }

        .cdm-danger:hover:not(:disabled) {
          transform: translateY(-1px);
        }

        .cdm-danger:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
