export const dynamic = "force-dynamic";

type SupabaseHealthStatus = "checking" | "available" | "unavailable";

const PING_TIMEOUT_MS = 8_000;

function json(status: SupabaseHealthStatus, responseStatus: number, upstreamStatus?: number) {
  return Response.json(
    { status, upstreamStatus },
    {
      status: responseStatus,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}

export async function GET() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!base || !anonKey) {
    return json("checking", 200);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);

  try {
    const res = await fetch(`${base}/rest/v1/`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
    });

    return res.status >= 500
      ? json("unavailable", 503, res.status)
      : json("available", 200, res.status);
  } catch {
    return json("unavailable", 503);
  } finally {
    clearTimeout(timeoutId);
  }
}
