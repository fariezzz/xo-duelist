"use client";
import React, { useState } from "react";

interface Props {
  email: string;
  onCreatePassword: () => Promise<{ success: boolean; error?: string }>;
}

export default function PasswordSetupCard({ email, onCreatePassword }: Props) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleCreatePassword() {
    setError(null);
    setSent(false);
    setSending(true);

    const result = await onCreatePassword();
    setSending(false);

    if (!result.success) {
      setError(result.error ?? "Failed to send password setup link.");
      return;
    }

    setSent(true);
  }

  return (
    <div className="card" style={{ padding: "28px" }}>
      <h2
        style={{
          fontFamily: "var(--font-heading)",
          fontWeight: 700,
          fontSize: "1.2rem",
          color: "var(--text-primary)",
          marginBottom: "16px",
          marginTop: 0,
        }}
      >
        Password
      </h2>

      <div
        style={{
          borderRadius: "10px",
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(15,23,42,0.5)",
          padding: "14px",
          marginBottom: "12px",
        }}
      >
        <div style={{ color: "#94a3b8", fontSize: "0.76rem", fontFamily: "var(--font-heading)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Status
        </div>
        <div style={{ color: "#f59e0b", fontFamily: "var(--font-heading)", fontWeight: 700, marginTop: "4px" }}>
          Not set
        </div>
        <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginTop: "8px", lineHeight: 1.45 }}>
          Create a password via email verification link. We will send it to <strong style={{ color: "var(--text-primary)" }}>{email}</strong>.
        </div>
      </div>

      {error && (
        <div
          style={{
            color: "#ef4444",
            fontSize: "0.84rem",
            fontFamily: "var(--font-heading)",
            marginBottom: "12px",
            padding: "10px",
            borderRadius: "8px",
            background: "rgba(239,68,68,0.1)",
            border: "1px solid rgba(239,68,68,0.2)",
          }}
        >
          {error}
        </div>
      )}

      {sent && (
        <div
          style={{
            color: "#10b981",
            fontSize: "0.84rem",
            fontFamily: "var(--font-heading)",
            marginBottom: "12px",
            padding: "10px",
            borderRadius: "8px",
            background: "rgba(16,185,129,0.1)",
            border: "1px solid rgba(16,185,129,0.2)",
          }}
        >
          Password setup link sent. Check your email inbox.
        </div>
      )}

      <button
        className="btn btn-primary"
        onClick={handleCreatePassword}
        disabled={sending}
        style={{ width: "100%" }}
      >
        {sending ? "Sending..." : "Create Password"}
      </button>
    </div>
  );
}
