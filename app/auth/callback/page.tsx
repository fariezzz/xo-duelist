"use client";
/**
 * OAuth Callback Page
 *
 * Supabase OAuth (PKCE flow) redirects back to this URL with a `code` param.
 * The code exchange MUST happen on the CLIENT side because the PKCE code verifier
 * is stored in the browser (localStorage/sessionStorage) by the Supabase JS client.
 * A server Route Handler cannot access it, which causes exchangeCodeForSession to fail.
 *
 * This page picks up the `code` from the URL, calls exchangeCodeForSession in the
 * browser, then redirects the user to /dashboard (or a safe `next` path when provided).
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient } from "../../../lib/supabase";
import type { EmailOtpType, UserIdentity } from "@supabase/supabase-js";

const MANAGED_OAUTH_PROVIDERS = new Set(["google", "github", "discord"]);
const EMAIL_OTP_TYPES: EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
];

function isEmailOtpType(value: string): value is EmailOtpType {
  return EMAIL_OTP_TYPES.includes(value as EmailOtpType);
}

function normalizeProvider(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function parseTimestamp(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getIdentityRecency(identity: UserIdentity): number {
  return Math.max(
    parseTimestamp(identity.last_sign_in_at),
    parseTimestamp(identity.updated_at),
    parseTimestamp(identity.created_at)
  );
}

function readIdentityAvatar(identity: UserIdentity): string | null {
  const data = identity.identity_data;
  if (!data || typeof data !== "object") return null;
  const candidates = ["avatar_url", "picture", "photo_url", "image", "profile_image_url"];
  for (const key of candidates) {
    const value = (data as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function normalizeAvatarUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let normalized = value.trim();
  if (!normalized) return null;

  normalized = normalized.replace(/^"+|"+$/g, "");
  const lower = normalized.toLowerCase();
  if (lower === "null" || lower === "undefined" || lower === "none" || lower === "n/a") {
    return null;
  }

  if (!/^https?:\/\//i.test(normalized)) return null;

  if (/googleusercontent\.com/i.test(normalized)) {
    normalized = normalized.replace(/=([^=/?#]+)=([^=/?#]+)$/, "=$1");
  }
  return normalized;
}

function resolveAvatarFromIdentities(identities: UserIdentity[]): string | null {
  const priority = ["google", "github", "discord"];
  for (const provider of priority) {
    const identity = identities.find((item) => normalizeProvider(item.provider) === provider);
    const avatarUrl = normalizeAvatarUrl(identity ? readIdentityAvatar(identity) : null);
    if (avatarUrl) return avatarUrl;
  }
  return null;
}

async function pruneDuplicateOAuthIdentities() {
  const { data, error } = await supabaseClient.auth.getUserIdentities();
  if (error || !data?.identities?.length) return;

  const grouped = new Map<string, UserIdentity[]>();
  for (const identity of data.identities) {
    const provider = normalizeProvider(identity.provider);
    if (!MANAGED_OAUTH_PROVIDERS.has(provider)) continue;

    const list = grouped.get(provider);
    if (list) {
      list.push(identity);
    } else {
      grouped.set(provider, [identity]);
    }
  }

  for (const [provider, identities] of grouped.entries()) {
    if (identities.length <= 1) continue;

    const keep = [...identities].sort((a, b) => {
      const recencyDiff = getIdentityRecency(b) - getIdentityRecency(a);
      if (recencyDiff !== 0) return recencyDiff;
      return a.identity_id.localeCompare(b.identity_id);
    })[0];

    for (const candidate of identities) {
      if (candidate.identity_id === keep.identity_id) continue;

      const { error: unlinkError } = await supabaseClient.auth.unlinkIdentity(candidate);
      if (unlinkError) {
        console.warn(`Failed to unlink duplicate ${provider} identity:`, unlinkError.message);
      }
    }
  }
}

async function syncAvatarAndOnlineStatus(userId: string) {
  const nowIso = new Date().toISOString();
  const updates: Record<string, string> = {
    status: "online",
    last_seen: nowIso,
  };

  const [profileResult, identitiesResult] = await Promise.all([
    supabaseClient
      .from("profiles")
      .select("avatar_url")
      .eq("id", userId)
      .maybeSingle(),
    supabaseClient.auth.getUserIdentities(),
  ]);

  const currentAvatar = normalizeAvatarUrl(profileResult.data?.avatar_url ?? null);
  const avatarFromIdentity = resolveAvatarFromIdentities(identitiesResult.data?.identities ?? []);

  if (!currentAvatar && avatarFromIdentity) {
    updates.avatar_url = avatarFromIdentity;
  }

  await supabaseClient
    .from("profiles")
    .update(updates)
    .eq("id", userId);
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const readSafeNextPath = (rawPath: string | null): string | null => {
      if (!rawPath) return null;
      if (!rawPath.startsWith("/") || rawPath.startsWith("//")) return null;
      return rawPath;
    };

    const requestedNext = params.get("next");
    const sessionStoredNext = typeof window !== "undefined"
      ? sessionStorage.getItem("xo_post_auth_redirect")
      : null;
    const nextPath = readSafeNextPath(requestedNext) ??
      readSafeNextPath(sessionStoredNext) ??
      "/dashboard";
    const callbackType = (params.get("type") ?? hashParams.get("type") ?? "").toLowerCase();
    const nextPathAfterAuth = callbackType === "recovery" ? "/auth/update-password" : nextPath;
    const tokenHash = params.get("token_hash") ?? hashParams.get("token_hash");
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("xo_post_auth_redirect");
    }

    // Supabase sometimes returns the session via hash fragment (#access_token=...)
    // and sometimes via query param (?code=...). Handle both.
    const code = params.get("code");
    const errorParam = params.get("error");
    const errorDesc = params.get("error_description");

    if (errorParam) {
      setError(errorDesc ?? errorParam);
      setTimeout(() => router.replace("/?error=auth_callback_failed"), 2500);
      return;
    }

    if (tokenHash && isEmailOtpType(callbackType)) {
      supabaseClient.auth.verifyOtp({ token_hash: tokenHash, type: callbackType }).then(
        async ({ data, error: verifyError }) => {
          if (verifyError) {
            console.error("verifyOtp error:", verifyError);
            setError(verifyError.message ?? "Email verification failed");
            setTimeout(() => router.replace("/?error=auth_callback_failed"), 2500);
            return;
          }

          if (data.session) {
            await pruneDuplicateOAuthIdentities();
            await syncAvatarAndOnlineStatus(data.session.user.id);
          }

          router.replace(nextPathAfterAuth);
        }
      );
      return;
    }

    if (code) {
      supabaseClient.auth
        .exchangeCodeForSession(code)
        .then(async ({ data, error: exchError }) => {
          if (exchError || !data.session) {
            console.error("exchangeCodeForSession error:", exchError);
            setError(exchError?.message ?? "Session exchange failed");
            setTimeout(() => router.replace("/?error=auth_callback_failed"), 2500);
            return;
          }
          await pruneDuplicateOAuthIdentities();

          // Mark user online and hydrate avatar_url if profile row is missing one.
          const userId = data.session.user.id;
          await syncAvatarAndOnlineStatus(userId);

          router.replace(nextPathAfterAuth);
        });
      return;
    }

    // No code and no error — Supabase may have used implicit flow via hash.
    // The client SDK handles the hash automatically; just redirect.
    supabaseClient.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        await pruneDuplicateOAuthIdentities();
        await syncAvatarAndOnlineStatus(data.session.user.id);
        router.replace(nextPathAfterAuth);
      } else {
        router.replace("/?error=auth_callback_failed");
      }
    });
  }, [router]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "16px",
        fontFamily: "var(--font-heading)",
        color: "var(--text-primary)",
      }}
    >
      {error ? (
        <>
          <span style={{ fontSize: "2rem" }}>❌</span>
          <p style={{ color: "#f87171", fontWeight: 700, fontSize: "1rem" }}>
            {error}
          </p>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
            Redirecting back to login…
          </p>
        </>
      ) : (
        <>
          <span
            className="animate-spin-slow"
            style={{
              display: "inline-block",
              width: 36,
              height: 36,
              border: "3px solid rgba(124,58,237,0.25)",
              borderTopColor: "#7c3aed",
              borderRadius: "50%",
            }}
          />
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
            Signing you in…
          </p>
        </>
      )}
    </div>
  );
}
