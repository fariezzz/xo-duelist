"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "../../components/Navbar";
import AvatarUpload from "../../components/profile/AvatarUpload";
import ProfileStats from "../../components/profile/ProfileStats";
import ProfileForm from "../../components/profile/ProfileForm";
import ChangePasswordForm from "../../components/profile/ChangePasswordForm";
import DangerZone from "../../components/profile/DangerZone";
import { useProfile } from "../../hooks/useProfile";

export default function ProfilePage() {
  const router = useRouter();
  const {
    profile, loading, saving, error,
    usernameCheck, checkUsername,
    updateProfile, updateEmail, updatePassword,
    uploadAvatar, removeAvatar, deleteAccount,
  } = useProfile();

  const [isDirty, setIsDirty] = useState(false);
  const dirtyRef = useRef(false);

  // Keep ref in sync for beforeunload
  useEffect(() => { dirtyRef.current = isDirty; }, [isDirty]);

  // Warn on navigation with unsaved changes
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const handleDirtyChange = useCallback((dirty: boolean) => {
    setIsDirty(dirty);
  }, []);

  // Loading state
  if (loading) {
    return (
      <>
        <Navbar />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
          <div style={{ textAlign: "center" }}>
            <div
              className="animate-spin-slow"
              style={{
                width: 40, height: 40,
                border: "3px solid rgba(124,58,237,0.2)",
                borderTopColor: "#7c3aed",
                borderRadius: "50%",
                margin: "0 auto 16px",
              }}
            />
            <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-heading)" }}>Loading profile...</span>
          </div>
        </div>
      </>
    );
  }

  // Error state
  if (error || !profile) {
    return (
      <>
        <Navbar />
        <div className="page-container animate-fade-in" style={{ padding: "32px 24px", paddingTop: "calc(var(--navbar-height) + 32px)" }}>
          <div className="card" style={{ maxWidth: "500px", margin: "0 auto", textAlign: "center", padding: "40px" }}>
            <div style={{ fontSize: "2rem", marginBottom: "12px" }}>😕</div>
            <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 700, color: "#ef4444", marginBottom: "8px" }}>
              Failed to load profile
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "20px" }}>{error}</p>
            <button className="btn btn-primary" onClick={() => router.push("/dashboard")}>
              ← Back to Dashboard
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="animate-fade-in" style={{ padding: "32px 24px", paddingTop: "calc(var(--navbar-height) + 32px)", minHeight: "100vh" }}>
        <div style={{ maxWidth: "900px", margin: "0 auto" }}>
          {/* Header */}
          <h1
            className="heading"
            style={{ fontSize: "1.8rem", marginBottom: "4px" }}
          >
            👤 My Profile
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "28px" }}>
            Manage your account settings and personal information.
          </p>

          {/* Two-column layout */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "280px 1fr",
              gap: "24px",
              alignItems: "start",
            }}
            className="profile-grid"
          >
            {/* Left column: Avatar + Stats */}
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Avatar card */}
              <div className="card" style={{ padding: "28px", textAlign: "center" }}>
                <AvatarUpload
                  avatarUrl={profile.avatar_url}
                  username={profile.username}
                  onUpload={uploadAvatar}
                  onRemove={removeAvatar}
                />
                <div
                  style={{
                    fontFamily: "var(--font-heading)",
                    fontWeight: 700,
                    fontSize: "1.1rem",
                    color: "var(--text-primary)",
                    marginTop: "12px",
                  }}
                >
                  {profile.username}
                </div>
                {profile.bio && (
                  <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginTop: "4px" }}>
                    {profile.bio}
                  </div>
                )}
              </div>

              {/* Stats card */}
              <ProfileStats profile={profile} />
            </div>

            {/* Right column: Forms */}
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <ProfileForm
                profile={profile}
                usernameCheck={usernameCheck}
                saving={saving}
                onCheckUsername={checkUsername}
                onSave={updateProfile}
                onSaveEmail={updateEmail}
                onDirtyChange={handleDirtyChange}
              />

              <ChangePasswordForm onSubmit={updatePassword} />

              <DangerZone username={profile.username} onDelete={deleteAccount} />
            </div>
          </div>
        </div>
      </div>

      {/* Responsive breakpoint */}
      <style>{`
        @media (max-width: 768px) {
          .profile-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </>
  );
}
