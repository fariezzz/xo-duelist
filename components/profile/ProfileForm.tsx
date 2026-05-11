"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ManagedProvider, ProfileData } from "../../hooks/useProfile";

interface UsernameCheck {
  status: "idle" | "checking" | "available" | "taken" | "invalid" | "same";
  message: string;
}

interface Props {
  profile: ProfileData;
  usernameCheck: UsernameCheck;
  saving: boolean;
  onCheckUsername: (username: string) => void;
  onSave: (updates: { username?: string; bio?: string }) => Promise<{ success: boolean; error?: string }>;
  onSaveEmail: (email: string) => Promise<{ success: boolean; error?: string }>;
  onLinkProvider: (provider: ManagedProvider) => Promise<{ success: boolean; error?: string }>;
  onUnlinkProvider: (provider: ManagedProvider) => Promise<{ success: boolean; error?: string }>;
  onDirtyChange: (dirty: boolean) => void;
}

type ManagedProviderRow = {
  provider: ManagedProvider;
  label: string;
};

type UnlinkConfirmState = {
  provider: ManagedProvider;
  label: string;
  identifier: string | null;
};

const MANAGED_PROVIDER_ROWS: ManagedProviderRow[] = [
  { provider: "google", label: "Google" },
  { provider: "github", label: "GitHub" },
  { provider: "discord", label: "Discord" },
];

function ProviderIcon({ provider }: { provider: ManagedProvider }) {
  if (provider === "google") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.73 1.22 9.24 3.6l6.87-6.87C35.96 2.54 30.39 0 24 0 14.62 0 6.54 5.38 2.58 13.22l8 6.21C12.54 13.53 17.83 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.64-.15-3.22-.43-4.75H24v9h12.94c-.57 3.04-2.29 5.62-4.89 7.35l7.54 5.85C43.98 37.95 46.98 31.85 46.98 24.55z" />
        <path fill="#FBBC05" d="M10.58 28.57a14.5 14.5 0 0 1 0-9.13l-8-6.22A23.96 23.96 0 0 0 0 24c0 3.88.93 7.55 2.58 10.78l8-6.21z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.92-2.13 15.89-5.8l-7.54-5.85c-2.09 1.4-4.76 2.22-8.35 2.22-6.17 0-11.46-4.03-13.42-9.93l-8 6.21C6.54 42.62 14.62 48 24 48z" />
      </svg>
    );
  }

  if (provider === "github") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.21.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.46-1.15-1.11-1.46-1.11-1.46-.9-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.64.35-1.09.64-1.34-2.22-.25-4.56-1.11-4.56-4.95 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.03a9.6 9.6 0 0 1 5.01 0c1.9-1.3 2.74-1.03 2.74-1.03.55 1.38.21 2.4.11 2.65.64.7 1.03 1.59 1.03 2.68 0 3.85-2.34 4.69-4.57 4.94.36.31.68.92.68 1.86v2.76c0 .27.18.57.69.47A10 10 0 0 0 12 2z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.32 4.37a19.79 19.79 0 0 0-4.89-1.52.08.08 0 0 0-.08.04c-.21.37-.44.86-.61 1.25a18.3 18.3 0 0 0-5.49 0c-.16-.39-.4-.88-.61-1.25a.08.08 0 0 0-.08-.04 19.73 19.73 0 0 0-4.89 1.52.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.05 19.9 19.9 0 0 0 6 3.03.08.08 0 0 0 .08-.03 14.1 14.1 0 0 0 1.22-1.99.08.08 0 0 0-.04-.11 13.06 13.06 0 0 1-1.87-.89.08.08 0 0 1-.01-.13c.13-.1.25-.2.37-.3a.07.07 0 0 1 .08-.01c3.93 1.8 8.18 1.8 12.06 0a.07.07 0 0 1 .08.01c.12.1.25.2.37.3a.08.08 0 0 1-.01.13c-.6.35-1.22.65-1.87.89a.08.08 0 0 0-.04.11c.35.7.76 1.36 1.22 1.99a.08.08 0 0 0 .08.03 19.84 19.84 0 0 0 6-3.03.08.08 0 0 0 .03-.05c.5-5.18-.84-9.67-3.55-13.66a.06.06 0 0 0-.03-.03zM8.02 15.33c-1.18 0-2.16-1.09-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.2 0 2.17 1.1 2.15 2.42 0 1.33-.95 2.42-2.15 2.42zm7.98 0c-1.18 0-2.16-1.09-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.2 0 2.17 1.1 2.15 2.42 0 1.33-.95 2.42-2.15 2.42z" />
    </svg>
  );
}

export default function ProfileForm({
  profile,
  usernameCheck,
  saving,
  onCheckUsername,
  onSave,
  onSaveEmail,
  onLinkProvider,
  onUnlinkProvider,
  onDirtyChange,
}: Props) {
  const [username, setUsername] = useState(profile.username);
  const [email, setEmail] = useState(profile.email);
  const [bio, setBio] = useState(profile.bio ?? "");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [emailWarning, setEmailWarning] = useState(false);
  const [providerActionLoading, setProviderActionLoading] = useState<ManagedProvider | null>(null);
  const [providerActionError, setProviderActionError] = useState<string | null>(null);
  const [unlinkConfirm, setUnlinkConfirm] = useState<UnlinkConfirmState | null>(null);
  const initialRef = useRef({ username: profile.username, email: profile.email, bio: profile.bio ?? "" });

  const isDirty =
    username !== initialRef.current.username ||
    email !== initialRef.current.email ||
    bio !== initialRef.current.bio;

  const canSave =
    isDirty &&
    !saving &&
    usernameCheck.status !== "taken" &&
    usernameCheck.status !== "invalid" &&
    usernameCheck.status !== "checking";

  const linkedAccountMap = useMemo(
    () => new Map(profile.linkedAccounts.map((account) => [account.provider, account] as const)),
    [profile.linkedAccounts]
  );

  const linkedIdentityCount = useMemo(
    () => profile.linkedAccounts.filter((account) => !!account.identityId).length,
    [profile.linkedAccounts]
  );

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    setUsername(profile.username);
    setEmail(profile.email);
    setBio(profile.bio ?? "");
    initialRef.current = { username: profile.username, email: profile.email, bio: profile.bio ?? "" };
  }, [profile.username, profile.email, profile.bio]);

  function handleUsernameChange(value: string) {
    setUsername(value);
    setFieldErrors((prev) => ({ ...prev, username: "" }));
    setSuccessMsg(null);
    onCheckUsername(value);
  }

  function handleEmailChange(value: string) {
    setEmail(value);
    setFieldErrors((prev) => ({ ...prev, email: "" }));
    setSuccessMsg(null);
    setEmailWarning(value !== initialRef.current.email);
  }

  function handleBioChange(value: string) {
    if (value.length > 150) return;
    setBio(value);
    setSuccessMsg(null);
  }

  async function handleLinkProvider(provider: ManagedProvider, label: string) {
    setProviderActionError(null);
    setSuccessMsg(null);
    setProviderActionLoading(provider);

    const result = await onLinkProvider(provider);

    setProviderActionLoading(null);
    if (!result.success) {
      setProviderActionError(result.error ?? `Failed to connect ${label}.`);
      return;
    }

    setSuccessMsg(`Redirecting to ${label} to finish linking...`);
  }

  function openUnlinkConfirm(provider: ManagedProvider, label: string, identifier: string | null) {
    setProviderActionError(null);
    setSuccessMsg(null);
    setUnlinkConfirm({ provider, label, identifier });
  }

  function closeUnlinkConfirm() {
    if (providerActionLoading) return;
    setUnlinkConfirm(null);
  }

  async function confirmUnlinkProvider() {
    if (!unlinkConfirm) return;
    setProviderActionLoading(unlinkConfirm.provider);
    const result = await onUnlinkProvider(unlinkConfirm.provider);
    setProviderActionLoading(null);

    if (!result.success) {
      setProviderActionError(result.error ?? `Failed to disconnect ${unlinkConfirm.label}.`);
      return;
    }

    setSuccessMsg(`${unlinkConfirm.label} disconnected successfully.`);
    setUnlinkConfirm(null);
  }

  async function handleSave() {
    setFieldErrors({});
    setSuccessMsg(null);

    if (email !== initialRef.current.email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setFieldErrors((prev) => ({ ...prev, email: "Please enter a valid email address" }));
        return;
      }
    }

    const profileUpdates: { username?: string; bio?: string } = {};
    if (username !== initialRef.current.username) profileUpdates.username = username;
    if (bio !== initialRef.current.bio) profileUpdates.bio = bio;

    if (Object.keys(profileUpdates).length > 0) {
      const result = await onSave(profileUpdates);
      if (!result.success) {
        if (result.error?.toLowerCase().includes("username")) {
          setFieldErrors((prev) => ({ ...prev, username: result.error ?? "Username update failed" }));
        } else {
          setFieldErrors((prev) => ({ ...prev, general: result.error ?? "Failed to update profile" }));
        }
        return;
      }
    }

    if (email !== initialRef.current.email) {
      const result = await onSaveEmail(email);
      if (!result.success) {
        setFieldErrors((prev) => ({ ...prev, email: result.error ?? "Failed to update email" }));
        return;
      }
    }

    initialRef.current = { username, email, bio };
    setEmailWarning(false);
    setSuccessMsg(
      email !== profile.email
        ? "Profile updated. Please confirm your new email."
        : "Profile updated successfully."
    );
  }

  const usernameIndicator = (() => {
    if (usernameCheck.status === "checking") return <span className="username-indicator checking">...</span>;
    if (usernameCheck.status === "available") return <span className="username-indicator valid">OK</span>;
    if (usernameCheck.status === "taken") return <span className="username-indicator invalid">NO</span>;
    if (usernameCheck.status === "invalid") return <span className="username-indicator invalid">NO</span>;
    return null;
  })();

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontFamily: "var(--font-heading)",
    fontWeight: 600,
    fontSize: "0.78rem",
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
    <>
      <div className="card" style={{ padding: "24px" }}>
        <h2
          style={{
            fontFamily: "var(--font-heading)",
            fontWeight: 700,
            fontSize: "1.15rem",
            color: "var(--text-primary)",
            marginBottom: "18px",
            marginTop: 0,
          }}
        >
          Edit Profile
        </h2>

        {fieldErrors.general && (
          <div style={{ ...errorStyle, marginBottom: "14px", padding: "10px", borderRadius: "8px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
            {fieldErrors.general}
          </div>
        )}

        {successMsg && (
          <div
            style={{
              color: "#10b981",
              fontSize: "0.84rem",
              fontFamily: "var(--font-heading)",
              marginBottom: "14px",
              padding: "10px",
              borderRadius: "8px",
              background: "rgba(16,185,129,0.1)",
              border: "1px solid rgba(16,185,129,0.2)",
            }}
          >
            {successMsg}
          </div>
        )}

        <div style={{ marginBottom: "18px" }}>
          <label style={labelStyle}>Username</label>
          <div style={{ position: "relative" }}>
            <input
              className="input"
              value={username}
              onChange={(event) => handleUsernameChange(event.target.value)}
              maxLength={20}
              style={{ paddingRight: "44px" }}
            />
            {usernameIndicator && (
              <span
                style={{
                  position: "absolute",
                  right: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
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

        <div style={{ marginBottom: "18px" }}>
          <label style={labelStyle}>Email</label>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(event) => handleEmailChange(event.target.value)}
          />
          {emailWarning && (
            <div
              style={{
                color: "#f59e0b",
                fontSize: "0.78rem",
                fontFamily: "var(--font-heading)",
                marginTop: "4px",
              }}
            >
              A confirmation link will be sent to your new email address.
            </div>
          )}
          {fieldErrors.email && <div style={errorStyle}>{fieldErrors.email}</div>}
        </div>

        <section className="oauth-shell" aria-label="Connected accounts">
          <div className="oauth-header-row">
            <h3 className="oauth-title">Connected Accounts</h3>
            <span className="oauth-subtitle">Launcher Access</span>
          </div>

          <div className="oauth-grid">
            {MANAGED_PROVIDER_ROWS.map((providerRow) => {
              const account = linkedAccountMap.get(providerRow.provider) ?? null;
              const isConnected = Boolean(account?.identityId);
              const canDisconnect = isConnected && linkedIdentityCount > 1;
              const identifier = account?.identifier?.trim() ?? null;
              const loadingThisProvider = providerActionLoading === providerRow.provider;

              return (
                <article
                  key={providerRow.provider}
                  className={`oauth-card ${isConnected ? "is-connected" : "is-disconnected"}`}
                >
                  <div className="oauth-main">
                    <div className="oauth-avatar">
                      <ProviderIcon provider={providerRow.provider} />
                    </div>

                    <div className="oauth-info">
                      <div className="oauth-line-top">
                        <span className="oauth-provider-name">{providerRow.label}</span>
                      </div>
                      <div className="oauth-meta-value" title={identifier ?? ""}>
                        {isConnected
                          ? (identifier ?? "Linked account")
                          : "No linked account"}
                      </div>
                    </div>
                  </div>

                  <div className="oauth-actions">
                    {isConnected ? (
                      <>
                        <span className="oauth-connected-pill">Connected</span>
                        <button
                          type="button"
                          className="oauth-btn-disconnect"
                          disabled={!canDisconnect || loadingThisProvider || saving}
                          onClick={() => openUnlinkConfirm(providerRow.provider, providerRow.label, identifier)}
                          title={canDisconnect ? `Disconnect ${providerRow.label}` : "Connect another provider before disconnecting this one"}
                        >
                          {loadingThisProvider ? "Please wait..." : "Disconnect"}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="oauth-btn-connect"
                        disabled={loadingThisProvider || saving}
                        onClick={() => handleLinkProvider(providerRow.provider, providerRow.label)}
                      >
                        {loadingThisProvider ? "Redirecting..." : "Connect"}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          <div className="oauth-warning">
            Connecting a provider with the same verified email may link it to your existing account.
          </div>
          {providerActionError && <div style={errorStyle}>{providerActionError}</div>}
        </section>

        <div style={{ marginBottom: "20px", marginTop: "18px" }}>
          <label style={labelStyle}>Bio</label>
          <textarea
            className="input"
            value={bio}
            onChange={(event) => handleBioChange(event.target.value)}
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
            "Save Changes"
          )}
        </button>
      </div>

      {typeof window !== "undefined" && unlinkConfirm && createPortal(
        <div className="unlink-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="unlink-title">
          <div className="unlink-modal-card">
            <h4 id="unlink-title">Disconnect {unlinkConfirm.label}?</h4>
            <p>
              You will no longer be able to sign in with this {unlinkConfirm.label} account.
            </p>
            <div className="unlink-preview">
              <span className="unlink-preview-label">Linked identity</span>
              <span className="unlink-preview-value">{unlinkConfirm.identifier ?? "Unknown account"}</span>
            </div>
            <div className="unlink-note">
              Keep at least one other provider connected so you do not lose access.
            </div>
            <div className="unlink-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={closeUnlinkConfirm}
                disabled={!!providerActionLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={confirmUnlinkProvider}
                disabled={providerActionLoading !== null}
              >
                {providerActionLoading ? "Disconnecting..." : "Yes, Disconnect"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <style jsx>{`
        .username-indicator {
          font-family: var(--font-heading);
          font-size: 0.66rem;
          font-weight: 700;
          letter-spacing: 0.04em;
        }

        .username-indicator.checking {
          color: #94a3b8;
        }

        .username-indicator.valid {
          color: #10b981;
        }

        .username-indicator.invalid {
          color: #ef4444;
        }

        .oauth-shell {
          border-radius: 12px;
          border: 1px solid rgba(124, 58, 237, 0.24);
          background:
            linear-gradient(135deg, rgba(124, 58, 237, 0.13), rgba(245, 158, 11, 0.06)),
            rgba(8, 13, 24, 0.76);
          padding: 12px;
        }

        .oauth-header-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 10px;
        }

        .oauth-title {
          margin: 0;
          font-family: var(--font-heading);
          font-size: 0.86rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #c4b5fd;
        }

        .oauth-subtitle {
          font-family: var(--font-heading);
          font-size: 0.65rem;
          color: #94a3b8;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .oauth-grid {
          display: grid;
          gap: 8px;
        }

        .oauth-card {
          position: relative;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(15, 23, 42, 0.62);
          padding: 10px;
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          gap: 10px;
          overflow: hidden;
          transition: border-color 180ms ease, transform 180ms ease, box-shadow 180ms ease, background 180ms ease;
        }

        .oauth-card::before {
          content: "";
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 12% 8%, rgba(167, 139, 250, 0.2), transparent 58%);
          opacity: 0;
          transition: opacity 180ms ease;
          pointer-events: none;
        }

        .oauth-card:hover {
          transform: translateY(-1px);
          border-color: rgba(167, 139, 250, 0.4);
          box-shadow: 0 10px 24px rgba(3, 8, 23, 0.34);
        }

        .oauth-card:hover::before {
          opacity: 1;
        }

        .oauth-card.is-connected {
          border-color: rgba(16, 185, 129, 0.3);
          background: rgba(8, 22, 22, 0.62);
        }

        .oauth-main {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .oauth-avatar {
          width: 30px;
          height: 30px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .oauth-avatar :global(svg) {
          width: 20px;
          height: 20px;
          color: #dbeafe;
        }

        .oauth-info {
          min-width: 0;
          display: grid;
          gap: 2px;
        }

        .oauth-line-top {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .oauth-provider-name {
          font-family: var(--font-heading);
          font-size: 0.87rem;
          font-weight: 700;
          color: #f8fafc;
        }

        .oauth-meta-value {
          color: #e2e8f0;
          font-size: 0.77rem;
          font-family: var(--font-heading);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .oauth-actions {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .oauth-connected-pill {
          height: 31px;
          border-radius: 8px;
          padding: 0 10px;
          border: 1px solid rgba(16, 185, 129, 0.32);
          background: rgba(16, 185, 129, 0.14);
          color: #86efac;
          font-family: var(--font-heading);
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .oauth-btn-connect,
        .oauth-btn-disconnect {
          height: 31px;
          border-radius: 8px;
          padding: 0 11px;
          border: 1px solid transparent;
          font-family: var(--font-heading);
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          cursor: pointer;
          transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease, border-color 160ms ease, color 160ms ease;
        }

        .oauth-btn-connect {
          color: #f8fafc;
          border-color: rgba(124, 58, 237, 0.62);
          background: linear-gradient(135deg, rgba(124, 58, 237, 0.95), rgba(99, 102, 241, 0.9));
          box-shadow: 0 0 0 1px rgba(124, 58, 237, 0.3), 0 8px 16px rgba(76, 29, 149, 0.35);
        }

        .oauth-btn-connect:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 0 0 1px rgba(167, 139, 250, 0.4), 0 10px 22px rgba(76, 29, 149, 0.5);
        }

        .oauth-btn-disconnect {
          color: #fca5a5;
          border-color: rgba(248, 113, 113, 0.35);
          background: rgba(127, 29, 29, 0.25);
        }

        .oauth-btn-disconnect:hover:not(:disabled) {
          transform: translateY(-1px);
          background: rgba(127, 29, 29, 0.45);
        }

        .oauth-btn-disconnect:disabled,
        .oauth-btn-connect:disabled {
          cursor: not-allowed;
          opacity: 0.55;
          transform: none;
          box-shadow: none;
        }

        .oauth-warning {
          margin-top: 10px;
          border: 1px solid rgba(245, 158, 11, 0.28);
          background: rgba(245, 158, 11, 0.08);
          border-radius: 8px;
          padding: 8px 10px;
          font-size: 0.73rem;
          color: #fcd34d;
          line-height: 1.45;
          font-family: var(--font-heading);
        }

        .unlink-modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 2000;
          background: rgba(2, 6, 23, 0.78);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
        }

        .unlink-modal-card {
          width: min(100%, 420px);
          border-radius: 12px;
          border: 1px solid rgba(248, 113, 113, 0.35);
          background: linear-gradient(170deg, rgba(30, 41, 59, 0.97), rgba(15, 23, 42, 0.98));
          box-shadow: 0 18px 42px rgba(2, 6, 23, 0.6);
          padding: 16px;
        }

        .unlink-modal-card h4 {
          margin: 0;
          color: #fecaca;
          font-family: var(--font-heading);
          font-size: 1rem;
        }

        .unlink-modal-card p {
          margin: 8px 0 0;
          color: #cbd5e1;
          font-family: var(--font-heading);
          font-size: 0.82rem;
          line-height: 1.45;
        }

        .unlink-preview {
          margin-top: 12px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.04);
          padding: 8px 10px;
          display: grid;
          gap: 2px;
        }

        .unlink-preview-label {
          font-family: var(--font-heading);
          font-size: 0.64rem;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          color: #94a3b8;
        }

        .unlink-preview-value {
          font-family: var(--font-heading);
          font-size: 0.8rem;
          color: #f8fafc;
          word-break: break-word;
        }

        .unlink-note {
          margin-top: 10px;
          color: #fca5a5;
          font-size: 0.74rem;
          font-family: var(--font-heading);
          line-height: 1.4;
        }

        .unlink-actions {
          margin-top: 14px;
          display: flex;
          justify-content: flex-end;
          gap: 8px;
        }

        @media (max-width: 700px) {
          .oauth-card {
            grid-template-columns: 1fr;
            gap: 10px;
          }

          .oauth-actions {
            justify-content: flex-start;
          }

          .oauth-btn-connect,
          .oauth-btn-disconnect,
          .oauth-connected-pill {
            flex: 1 1 auto;
            min-width: 110px;
          }
        }
      `}</style>
    </>
  );
}
