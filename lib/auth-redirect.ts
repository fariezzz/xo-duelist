const LOCALHOST_HOSTS = new Set(['localhost', '127.0.0.1']);

function normalizeBaseUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const parsed = new URL(withProtocol);
    if (LOCALHOST_HOSTS.has(parsed.hostname) && parsed.protocol !== 'http:') {
      parsed.protocol = 'http:';
    }
    if (!parsed.pathname.endsWith('/')) {
      parsed.pathname = `${parsed.pathname}/`;
    }
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

export function getAuthRedirectUrl(path: string): string | undefined {
  const baseFromWindow =
    typeof window !== 'undefined' ? normalizeBaseUrl(window.location.origin) : null;
  const baseFromEnv = normalizeBaseUrl(process.env.NEXT_PUBLIC_SITE_URL ?? '');
  const baseFromVercel = normalizeBaseUrl(process.env.NEXT_PUBLIC_VERCEL_URL ?? '');
  const baseUrl = baseFromWindow ?? baseFromEnv ?? baseFromVercel;

  if (!baseUrl) return undefined;

  const normalizedPath = path.replace(/^\/+/, '');
  return new URL(normalizedPath, baseUrl).toString();
}
