"use client";
import React, { useRef, useState } from "react";

interface Props {
  avatarUrl: string | null;
  username: string;
  onUpload: (file: File, onProgress: (pct: number) => void) => Promise<string>;
  onRemove: () => Promise<void>;
}

export default function AvatarUpload({ avatarUrl, username, onUpload, onRemove }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  const initials = (username || "?")
    .split("_")
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    // Validate type
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Only JPG, PNG, or WEBP files allowed");
      return;
    }
    // Validate size (2MB)
    if (file.size > 2 * 1024 * 1024) {
      setError("File must be under 2MB");
      return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);

    // Upload
    (async () => {
      try {
        setProgress(0);
        await onUpload(file, setProgress);
        setPreview(null);
        setProgress(null);
      } catch (err: any) {
        setError(err?.message ?? "Upload failed");
        setPreview(null);
        setProgress(null);
      }
    })();

    // Reset input
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleRemove() {
    setRemoving(true);
    setError(null);
    try {
      await onRemove();
    } catch (err: any) {
      setError(err?.message ?? "Failed to remove avatar");
    } finally {
      setRemoving(false);
    }
  }

  const displaySrc = preview || avatarUrl;
  const isUploading = progress !== null;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
      {/* Avatar circle */}
      <div
        onClick={() => !isUploading && fileRef.current?.click()}
        style={{
          width: 120,
          height: 120,
          borderRadius: "50%",
          padding: 3,
          background: "linear-gradient(135deg, #7c3aed, #f59e0b)",
          cursor: isUploading ? "default" : "pointer",
          position: "relative",
          flexShrink: 0,
        }}
      >
        {/* Inner circle */}
        <div
          style={{
            width: "100%",
            height: "100%",
            borderRadius: "50%",
            overflow: "hidden",
            background: displaySrc ? "transparent" : "linear-gradient(135deg, rgba(124,58,237,0.3), rgba(245,158,11,0.3))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {displaySrc ? (
            <img
              src={displaySrc}
              alt="Avatar"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <span
              style={{
                fontFamily: "var(--font-heading)",
                fontWeight: 700,
                fontSize: "2rem",
                color: "var(--text-primary)",
                textShadow: "0 0 20px rgba(124,58,237,0.4)",
              }}
            >
              {initials}
            </span>
          )}
        </div>

        {/* Hover overlay */}
        {!isUploading && (
          <div
            style={{
              position: "absolute",
              inset: 3,
              borderRadius: "50%",
              background: "rgba(0,0,0,0.6)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "4px",
              opacity: 0,
              transition: "opacity 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "0")}
          >
            <span style={{ fontSize: "1.5rem" }}>📷</span>
            <span
              style={{
                fontFamily: "var(--font-heading)",
                fontWeight: 600,
                fontSize: "0.7rem",
                color: "white",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Change Photo
            </span>
          </div>
        )}

        {/* Upload progress ring */}
        {isUploading && (
          <div
            style={{
              position: "absolute",
              inset: -1,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="128" height="128" viewBox="0 0 128 128" style={{ transform: "rotate(-90deg)" }}>
              <circle cx="64" cy="64" r="58" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="4" />
              <circle
                cx="64" cy="64" r="58"
                fill="none"
                stroke="#7c3aed"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 58}`}
                strokeDashoffset={`${2 * Math.PI * 58 * (1 - (progress ?? 0) / 100)}`}
                style={{ transition: "stroke-dashoffset 0.3s ease", filter: "drop-shadow(0 0 6px rgba(124,58,237,0.5))" }}
              />
            </svg>
            <span
              style={{
                position: "absolute",
                fontFamily: "var(--font-heading)",
                fontWeight: 700,
                fontSize: "0.85rem",
                color: "#a78bfa",
              }}
            >
              {progress}%
            </span>
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileSelect}
        style={{ display: "none" }}
      />

      {/* Remove button */}
      {avatarUrl && !isUploading && (
        <button
          onClick={handleRemove}
          disabled={removing}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            fontSize: "0.8rem",
            cursor: "pointer",
            fontFamily: "var(--font-heading)",
            fontWeight: 500,
            padding: "4px 8px",
            transition: "color 0.2s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
        >
          {removing ? "Removing..." : "Remove Photo"}
        </button>
      )}

      {/* Error */}
      {error && (
        <div style={{ color: "#ef4444", fontSize: "0.8rem", fontFamily: "var(--font-heading)", textAlign: "center" }}>
          {error}
        </div>
      )}
    </div>
  );
}
