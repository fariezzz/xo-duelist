"use client";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient } from "../../../lib/supabase";

const PASSWORD_METADATA_KEY = "xo_has_password";

function getStrength(pw: string): { level: "weak" | "medium" | "strong"; pct: number; color: string } {
  if (pw.length < 8) return { level: "weak", pct: 20, color: "#ef4444" };
  const types = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((r) => r.test(pw)).length;
  if (types >= 3) return { level: "strong", pct: 100, color: "#10b981" };
  if (types >= 2) return { level: "medium", pct: 60, color: "#f59e0b" };
  return { level: "weak", pct: 30, color: "#ef4444" };
}

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const strength = useMemo(() => getStrength(password), [password]);
  const confirmMatch = confirmPassword.length > 0 && password === confirmPassword;
  const confirmMismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const canSubmit = password.length >= 8 && confirmMatch && !saving && hasSession;

  useEffect(() => {
    let mounted = true;

    supabaseClient.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setHasSession(!!data.session);
      setReady(true);
    });

    return () => {
      mounted = false;
    };
  }, []);

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    setSaving(true);

    const { data: userData, error: userError } = await supabaseClient.auth.getUser();

    if (userError) {
      setSaving(false);
      setError(userError.message || "Failed to load current user.");
      return;
    }

    const { error: updateError } = await supabaseClient.auth.updateUser({
      password,
      data: {
        ...(userData.user?.user_metadata ?? {}),
        [PASSWORD_METADATA_KEY]: true,
      },
    });
    setSaving(false);

    if (updateError) {
      const message = updateError.message || "";
      const normalized = message.toLowerCase();
      if (normalized.includes("weak") || normalized.includes("password")) {
        setError("Password is too weak. Use at least 8 characters with mixed types.");
      } else {
        setError(message || "Failed to set password.");
      }
      return;
    }

    setSuccess(true);
    setPassword("");
    setConfirmPassword("");

    setTimeout(async () => {
      await supabaseClient.auth.signOut({ scope: "local" }).catch(() => undefined);
      router.replace("/?password_set=1");
    }, 1200);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div className="card" style={{ width: "100%", maxWidth: "440px", padding: "28px" }}>
        <h1
          style={{
            marginTop: 0,
            marginBottom: "8px",
            fontFamily: "var(--font-heading)",
            fontWeight: 700,
            fontSize: "1.35rem",
            color: "var(--text-primary)",
          }}
        >
          Set Password
        </h1>
        <p style={{ marginTop: 0, marginBottom: "16px", color: "var(--text-muted)", fontSize: "0.9rem" }}>
          Create your password to enable email + password login for this account.
        </p>

        {!ready ? (
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>Checking recovery session...</p>
        ) : !hasSession ? (
          <div
            style={{
              color: "#fca5a5",
              fontSize: "0.86rem",
              fontFamily: "var(--font-heading)",
              border: "1px solid rgba(248,113,113,0.35)",
              background: "rgba(127,29,29,0.25)",
              borderRadius: "10px",
              padding: "12px",
            }}
          >
            Recovery session is missing or expired. Request a new password setup link from your profile page.
          </div>
        ) : (
          <>
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

            {success && (
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
                Password created. Redirecting to login...
              </div>
            )}

            <div style={{ marginBottom: "10px" }}>
              <label style={{ display: "block", marginBottom: "6px", color: "#94a3b8", fontFamily: "var(--font-heading)", fontSize: "0.78rem", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                New Password
              </label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Min 8 characters"
              />
            </div>

            {password.length > 0 && (
              <div style={{ marginBottom: "12px" }}>
                <div style={{ height: "4px", borderRadius: "2px", overflow: "hidden", background: "rgba(255,255,255,0.08)" }}>
                  <div style={{ height: "100%", width: `${strength.pct}%`, background: strength.color, transition: "width 0.2s ease" }} />
                </div>
                <div style={{ color: strength.color, fontSize: "0.72rem", fontFamily: "var(--font-heading)", marginTop: "4px", textTransform: "capitalize" }}>
                  {strength.level}
                </div>
              </div>
            )}

            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", marginBottom: "6px", color: "#94a3b8", fontFamily: "var(--font-heading)", fontSize: "0.78rem", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                Confirm Password
              </label>
              <input
                className="input"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                style={{ borderColor: confirmMismatch ? "rgba(239,68,68,0.5)" : confirmMatch ? "rgba(16,185,129,0.5)" : undefined }}
              />
              {confirmMismatch && <div style={{ marginTop: "4px", color: "#ef4444", fontSize: "0.78rem", fontFamily: "var(--font-heading)" }}>Passwords do not match.</div>}
              {confirmMatch && <div style={{ marginTop: "4px", color: "#10b981", fontSize: "0.78rem", fontFamily: "var(--font-heading)" }}>Passwords match.</div>}
            </div>

            <button className="btn btn-primary" onClick={handleSubmit} disabled={!canSubmit} style={{ width: "100%" }}>
              {saving ? "Saving..." : "Set Password"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
