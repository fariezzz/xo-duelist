"use client";
import React, { useState } from "react";
import { createPortal } from "react-dom";

interface Props {
  username: string;
  onDelete: () => Promise<void>;
  titleIcon?: React.ReactNode;
  deleteIcon?: React.ReactNode;
}

export default function DangerZone({ username, onDelete, titleIcon, deleteIcon }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [confirmInput, setConfirmInput] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = confirmInput === username;

  async function handleDelete() {
    setError(null);
    setDeleting(true);
    try {
      await onDelete();
      window.location.href = "/";
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete account");
      setDeleting(false);
    }
  }

  return (
    <>
      <div
        className="card"
        style={{
          padding: "28px",
          borderColor: "rgba(239,68,68,0.2)",
        }}
      >
        <h2
          style={{
            fontFamily: "var(--font-heading)",
            fontWeight: 700,
            fontSize: "1.2rem",
            color: "#ef4444",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "8px",
            marginTop: 0,
          }}
        >
          {titleIcon}
          Danger Zone
        </h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "20px" }}>
          Permanently delete your account and all associated data. This action cannot be undone.
        </p>
        <button
          className="btn btn-danger"
          onClick={() => setShowModal(true)}
          style={{ width: "100%" }}
        >
          {deleteIcon}
          Delete Account
        </button>
      </div>

      {/* Confirmation Modal */}
      {typeof window !== "undefined" && showModal && createPortal(
        <div className="delete-modal-overlay" onClick={() => !deleting && setShowModal(false)}>
          <div
            className="card delete-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              style={{
                fontFamily: "var(--font-heading)",
                fontWeight: 700,
                fontSize: "1.3rem",
                color: "#ef4444",
                marginTop: 0,
                marginBottom: "12px",
              }}
            >
              Delete Account
            </h3>

            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "20px", lineHeight: 1.5 }}>
              This action <strong style={{ color: "#ef4444" }}>cannot be undone</strong>. All your match history,
              ELO progress, and profile data will be permanently deleted.
            </p>

            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "8px" }}>
              Type <strong style={{ color: "var(--text-primary)" }}>{username}</strong> to confirm:
            </p>

            <input
              className="input"
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              placeholder={username}
              style={{
                marginBottom: "16px",
                borderColor: canDelete ? "rgba(239,68,68,0.5)" : undefined,
              }}
            />

            {error && (
              <div
                style={{
                  color: "#ef4444",
                  fontSize: "0.8rem",
                  fontFamily: "var(--font-heading)",
                  marginBottom: "12px",
                  padding: "8px",
                  borderRadius: "8px",
                  background: "rgba(239,68,68,0.1)",
                }}
              >
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                className="btn btn-danger"
                onClick={handleDelete}
                disabled={!canDelete || deleting}
                style={{ flex: 1 }}
              >
                {deleting ? "Deleting..." : "Delete My Account"}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => { setShowModal(false); setConfirmInput(""); setError(null); }}
                disabled={deleting}
                style={{ flex: 1 }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <style jsx>{`
        .delete-modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 2000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
          background: rgba(2, 6, 23, 0.78);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
          animation: fade-in 0.2s ease-out;
        }

        .delete-modal-card {
          max-width: 440px;
          width: min(100%, 440px);
          padding: 32px;
          border-color: rgba(239, 68, 68, 0.3);
          box-shadow: 0 0 60px rgba(239, 68, 68, 0.15);
          animation: scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
      `}</style>
    </>
  );
}
