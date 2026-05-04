"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient } from "../../lib/supabase";

export default function SessionConflictPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabaseClient.auth.getSession();
      if (cancelled) return;
      if (!data.session) router.replace("/");
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleLogout = async () => {
    setLoading(true);
    try {
      await Promise.race([
        supabaseClient.auth.signOut(),
        new Promise((resolve) => window.setTimeout(resolve, 1800)),
      ]);
      router.replace("/");
      window.location.replace("/");;
    } catch (error) {
      console.error("Session conflict logout failed:", error);
      window.location.replace("/");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        position: "relative",
        zIndex: 1,
      }}
    >
      <section
        className="card"
        style={{
          width: "100%",
          maxWidth: "520px",
          textAlign: "center",
          borderColor: "rgba(245, 158, 11, 0.35)",
          boxShadow: "0 0 40px rgba(245, 158, 11, 0.14)",
        }}
      >
        <div style={{ fontSize: "2rem", marginBottom: "10px" }}>!</div>
        <h1
          style={{
            margin: 0,
            fontFamily: "var(--font-heading)",
            fontSize: "1.6rem",
            fontWeight: 700,
            color: "var(--text-primary)",
          }}
        >
          Session Conflict Detected
        </h1>
        <p style={{ marginTop: "12px", color: "var(--text-muted)", lineHeight: 1.6 }}>
          Akun ini sedang aktif di browser atau tab lain. Demi keamanan, sesi di halaman ini dinonaktifkan.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleLogout}
          disabled={loading}
          style={{ marginTop: "18px", width: "100%", justifyContent: "center" }}
        >
          {loading ? "Logging out..." : "Logout from this browser"}
        </button>
      </section>
    </main>
  );
}
