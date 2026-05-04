"use client";
import React, { useState } from "react";

interface Props {
  onSubmit: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
}

function getStrength(pw: string): { level: "weak" | "medium" | "strong"; pct: number; color: string } {
  if (pw.length < 8) return { level: "weak", pct: 20, color: "#ef4444" };
  const types = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((r) => r.test(pw)).length;
  if (types >= 3) return { level: "strong", pct: 100, color: "#10b981" };
  if (types >= 2) return { level: "medium", pct: 60, color: "#f59e0b" };
  return { level: "weak", pct: 30, color: "#ef4444" };
}

export default function ChangePasswordForm({ onSubmit }: Props) {
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const strength = getStrength(newPw);
  const confirmMatch = confirmPw.length > 0 && newPw === confirmPw;
  const confirmMismatch = confirmPw.length > 0 && newPw !== confirmPw;
  const canSubmit = currentPw.length > 0 && newPw.length >= 8 && confirmMatch && !saving;

  async function handleSubmit() {
    setError(null);
    setSuccess(false);
    setSaving(true);

    const result = await onSubmit(currentPw, newPw);
    setSaving(false);

    if (result.success) {
      setSuccess(true);
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    } else {
      setError(result.error ?? "Failed to update password");
    }
  }

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontFamily: "var(--font-heading)",
    fontWeight: 600,
    fontSize: "0.8rem",
    color: "#94a3b8",
    marginBottom: "6px",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  };

  const eyeBtnStyle: React.CSSProperties = {
    position: "absolute",
    right: "12px",
    top: "50%",
    transform: "translateY(-50%)",
    background: "none",
    border: "none",
    color: "var(--text-muted)",
    cursor: "pointer",
    fontSize: "1rem",
    padding: "4px",
  };

  return (
    <div className="card" style={{ padding: "28px" }}>
      <h2
        style={{
          fontFamily: "var(--font-heading)",
          fontWeight: 700,
          fontSize: "1.2rem",
          color: "var(--text-primary)",
          marginBottom: "24px",
          marginTop: 0,
        }}
      >
        🔒 Change Password
      </h2>

      {/* Error */}
      {error && (
        <div
          style={{
            color: "#ef4444",
            fontSize: "0.85rem",
            fontFamily: "var(--font-heading)",
            marginBottom: "16px",
            padding: "10px",
            borderRadius: "8px",
            background: "rgba(239,68,68,0.1)",
            border: "1px solid rgba(239,68,68,0.2)",
          }}
        >
          {error}
        </div>
      )}

      {/* Success */}
      {success && (
        <div
          style={{
            color: "#10b981",
            fontSize: "0.85rem",
            fontFamily: "var(--font-heading)",
            marginBottom: "16px",
            padding: "10px",
            borderRadius: "8px",
            background: "rgba(16,185,129,0.1)",
            border: "1px solid rgba(16,185,129,0.2)",
          }}
        >
          ✓ Password updated! Please log in again.
        </div>
      )}

      {/* Current Password */}
      <div style={{ marginBottom: "20px" }}>
        <label style={labelStyle}>Current Password</label>
        <div style={{ position: "relative" }}>
          <input
            className="input"
            type={showCurrent ? "text" : "password"}
            value={currentPw}
            onChange={(e) => { setCurrentPw(e.target.value); setError(null); }}
            style={{ paddingRight: "40px" }}
          />
          <button onClick={() => setShowCurrent(!showCurrent)} style={eyeBtnStyle} type="button">
            {showCurrent ? "🙈" : "👁"}
          </button>
        </div>
      </div>

      {/* New Password */}
      <div style={{ marginBottom: "6px" }}>
        <label style={labelStyle}>New Password</label>
        <div style={{ position: "relative" }}>
          <input
            className="input"
            type={showNew ? "text" : "password"}
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            placeholder="Min 8 characters"
            style={{ paddingRight: "40px" }}
          />
          <button onClick={() => setShowNew(!showNew)} style={eyeBtnStyle} type="button">
            {showNew ? "🙈" : "👁"}
          </button>
        </div>
      </div>

      {/* Strength indicator */}
      {newPw.length > 0 && (
        <div style={{ marginBottom: "20px" }}>
          <div
            style={{
              height: "4px",
              background: "rgba(255,255,255,0.06)",
              borderRadius: "2px",
              overflow: "hidden",
              marginBottom: "4px",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${strength.pct}%`,
                background: strength.color,
                borderRadius: "2px",
                transition: "all 0.3s ease",
              }}
            />
          </div>
          <div style={{ fontSize: "0.72rem", color: strength.color, fontFamily: "var(--font-heading)", fontWeight: 600, textTransform: "capitalize" }}>
            {strength.level}
          </div>
        </div>
      )}

      {/* Confirm Password */}
      <div style={{ marginBottom: "24px" }}>
        <label style={labelStyle}>Confirm New Password</label>
        <div style={{ position: "relative" }}>
          <input
            className="input"
            type={showConfirm ? "text" : "password"}
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
            style={{
              paddingRight: "40px",
              borderColor: confirmMismatch ? "rgba(239,68,68,0.5)" : confirmMatch ? "rgba(16,185,129,0.5)" : undefined,
            }}
          />
          <button onClick={() => setShowConfirm(!showConfirm)} style={eyeBtnStyle} type="button">
            {showConfirm ? "🙈" : "👁"}
          </button>
        </div>
        {confirmMismatch && (
          <div style={{ color: "#ef4444", fontSize: "0.78rem", fontFamily: "var(--font-heading)", marginTop: "4px" }}>
            Passwords do not match
          </div>
        )}
        {confirmMatch && (
          <div style={{ color: "#10b981", fontSize: "0.78rem", fontFamily: "var(--font-heading)", marginTop: "4px" }}>
            ✓ Passwords match
          </div>
        )}
      </div>

      {/* Submit */}
      <button
        className="btn btn-primary"
        onClick={handleSubmit}
        disabled={!canSubmit}
        style={{ width: "100%" }}
      >
        {saving ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
            <span className="animate-spin-slow" style={{ display: "inline-block", width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%" }} />
            Updating...
          </span>
        ) : (
          "🔑 Update Password"
        )}
      </button>
    </div>
  );
}
