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
 * browser, then redirects the user to /dashboard.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient } from "../../../lib/supabase";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

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

          // Mark user online
          const userId = data.session.user.id;
          await supabaseClient
            .from("profiles")
            .update({ status: "online", last_seen: new Date().toISOString() })
            .eq("id", userId);

          router.replace("/dashboard");
        });
      return;
    }

    // No code and no error — Supabase may have used implicit flow via hash.
    // The client SDK handles the hash automatically; just redirect.
    supabaseClient.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace("/dashboard");
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
