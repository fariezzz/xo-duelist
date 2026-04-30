"use client";
import React, { useEffect, useState, useRef } from "react";
import type { ProfileData } from "../../hooks/useProfile";

interface UsernameCheck {
  status: 'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'same';
  message: string;
}

interface Props {
  profile: ProfileData;
  usernameCheck: UsernameCheck;
  saving: boolean;
  onCheckUsername: (username: string) => void;
  onSave: (updates: { username?: string; bio?: string }) => Promise<{ success: boolean; error?: string }>;
  onSaveEmail: (email: string) => Promise<{ success: boolean; error?: string }>;
  onDirtyChange: (dirty: boolean) => void;
}

export default function ProfileForm({
  profile, usernameCheck, saving, onCheckUsername, onSave, onSaveEmail, onDirtyChange,
}: Props) {
  const [username, setUsername] = useState(profile.username);
  const [email, setEmail] = useState(profile.email);
  const [bio, setBio] = useState(profile.bio ?? "");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [emailWarning, setEmailWarning] = useState(false);
  const initialRef = useRef({ username: profile.username, email: profile.email, bio: profile.bio ?? "" });

  // Track dirty state
  const isDirty =
    username !== initialRef.current.username ||
    email !== initialRef.current.email ||
    bio !== initialRef.current.bio;

  useEffect(() => { onDirtyChange(isDirty); }, [isDirty, onDirtyChange]);

  // Sync if profile reloads
  useEffect(() => {
    setUsername(profile.username);
    setEmail(profile.email);
    setBio(profile.bio ?? "");
    initialRef.current = { username: profile.username, email: profile.email, bio: profile.bio ?? "" };
  }, [profile.username, profile.email, profile.bio]);

  function handleUsernameChange(val: string) {
    setUsername(val);
    setFieldErrors((p) => ({ ...p, username: "" }));
    setSuccessMsg(null);
    onCheckUsername(val);
  }

  function handleEmailChange(val: string) {
    setEmail(val);
    setFieldErrors((p) => ({ ...p, email: "" }));
    setSuccessMsg(null);
    setEmailWarning(val !== initialRef.current.email);
  }

  function handleBioChange(val: string) {
    if (val.length > 150) return;
    setBio(val);
    setSuccessMsg(null);
  }

  const canSave =
    isDirty &&
    !saving &&
    usernameCheck.status !== "taken" &&
    usernameCheck.status !== "invalid" &&
    usernameCheck.status !== "checking";

  async function handleSave() {
    setFieldErrors({});
    setSuccessMsg(null);

    // Validate email
    if (email !== initialRef.current.email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setFieldErrors((p) => ({ ...p, email: "Please enter a valid email address" }));
        return;
      }
    }

    // Save profile fields
    const profileUpdates: { username?: string; bio?: string } = {};
    if (username !== initialRef.current.username) profileUpdates.username = username;
    if (bio !== initialRef.current.bio) profileUpdates.bio = bio;

    if (Object.keys(profileUpdates).length > 0) {
      const result = await onSave(profileUpdates);
      if (!result.success) {
        if (result.error?.includes("username")) {
          setFieldErrors((p) => ({ ...p, username: result.error! }));
        } else {
          setFieldErrors((p) => ({ ...p, general: result.error! }));
        }
        return;
      }
    }

    // Save email if changed
    if (email !== initialRef.current.email) {
      const result = await onSaveEmail(email);
      if (!result.success) {
        setFieldErrors((p) => ({ ...p, email: result.error! }));
        return;
      }
    }

    initialRef.current = { username, email, bio };
    setEmailWarning(false);
    setSuccessMsg(
      email !== profile.email
        ? "Profile updated! Check your new email to confirm the change."
        : "Profile updated successfully!"
    );
  }

  // Username status indicator
  const usernameIndicator = (() => {
    if (usernameCheck.status === "checking") return <span style={{ color: "var(--text-muted)" }} className="animate-spin-slow">⟳</span>;
    if (usernameCheck.status === "available") return <span style={{ color: "#10b981" }}>✓</span>;
    if (usernameCheck.status === "taken") return <span style={{ color: "#ef4444" }}>✗</span>;
    if (usernameCheck.status === "invalid") return <span style={{ color: "#ef4444" }}>✗</span>;
    return null;
  })();

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

  const errorStyle: React.CSSProperties = {
    color: "#ef4444",
    fontSize: "0.78rem",
    fontFamily: "var(--font-heading)",
    marginTop: "4px",
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
        ✏️ Edit Profile
      </h2>

      {/* General error */}
      {fieldErrors.general && (
        <div style={{ ...errorStyle, marginBottom: "16px", padding: "10px", borderRadius: "8px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
          {fieldErrors.general}
        </div>
      )}

      {/* Success */}
      {successMsg && (
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
          ✓ {successMsg}
        </div>
      )}

      {/* Username */}
      <div style={{ marginBottom: "20px" }}>
        <label style={labelStyle}>Username</label>
        <div style={{ position: "relative" }}>
          <input
            className="input"
            value={username}
            onChange={(e) => handleUsernameChange(e.target.value)}
            maxLength={20}
            style={{ paddingRight: "36px" }}
          />
          {usernameIndicator && (
            <span
              style={{
                position: "absolute",
                right: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                fontSize: "1rem",
              }}
            >
              {usernameIndicator}
            </span>
          )}
        </div>
        {(usernameCheck.status === "taken" || usernameCheck.status === "invalid") && (
          <div style={errorStyle}>{usernameCheck.message}</div>
        )}
        {usernameCheck.status === "available" && (
          <div style={{ color: "#10b981", fontSize: "0.78rem", fontFamily: "var(--font-heading)", marginTop: "4px" }}>
            {usernameCheck.message}
          </div>
        )}
        {fieldErrors.username && <div style={errorStyle}>{fieldErrors.username}</div>}
      </div>

      {/* Email */}
      <div style={{ marginBottom: "20px" }}>
        <label style={labelStyle}>Email</label>
        <input
          className="input"
          type="email"
          value={email}
          onChange={(e) => handleEmailChange(e.target.value)}
        />
        {emailWarning && (
          <div
            style={{
              color: "#f59e0b",
              fontSize: "0.78rem",
              fontFamily: "var(--font-heading)",
              marginTop: "4px",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            ⚠ A confirmation link will be sent to your new email address
          </div>
        )}
        {fieldErrors.email && <div style={errorStyle}>{fieldErrors.email}</div>}
      </div>

      {/* Bio */}
      <div style={{ marginBottom: "24px" }}>
        <label style={labelStyle}>Bio</label>
        <textarea
          className="input"
          value={bio}
          onChange={(e) => handleBioChange(e.target.value)}
          placeholder="Tell others about yourself..."
          rows={3}
          style={{ resize: "vertical", minHeight: "80px" }}
        />
        <div
          style={{
            textAlign: "right",
            fontSize: "0.75rem",
            color: bio.length > 140 ? "#f59e0b" : "var(--text-muted)",
            fontFamily: "var(--font-heading)",
            marginTop: "4px",
          }}
        >
          {bio.length}/150
        </div>
      </div>

      {/* Save button */}
      <button
        className="btn btn-primary"
        onClick={handleSave}
        disabled={!canSave}
        style={{ width: "100%" }}
      >
        {saving ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
            <span className="animate-spin-slow" style={{ display: "inline-block", width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%" }} />
            Saving...
          </span>
        ) : (
          "💾 Save Changes"
        )}
      </button>
    </div>
  );
}
