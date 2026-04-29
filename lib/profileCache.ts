type CachedProfile = {
  userId: string;
  elo: number;
  updatedAt: number;
};

const PROFILE_CACHE_KEY = 'xo-duelist:profile-cache:v1';
const profileCache = new Map<string, CachedProfile>();

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readStoredCache(): CachedProfile | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedProfile;
    if (
      !parsed ||
      typeof parsed.userId !== 'string' ||
      typeof parsed.elo !== 'number' ||
      typeof parsed.updatedAt !== 'number'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function getCachedProfile(userId?: string | null): CachedProfile | null {
  if (userId) {
    const inMemory = profileCache.get(userId);
    if (inMemory) return inMemory;
  }

  const stored = readStoredCache();
  if (!stored) return null;

  profileCache.set(stored.userId, stored);
  if (userId && stored.userId !== userId) return null;
  return stored;
}

export function setCachedProfile(userId: string, elo: number) {
  const value: CachedProfile = {
    userId,
    elo,
    updatedAt: Date.now(),
  };
  profileCache.set(userId, value);
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(value));
  } catch {
    // ignore storage errors
  }
}

export function clearCachedProfile(userId?: string | null) {
  if (userId) profileCache.delete(userId);
  else profileCache.clear();

  if (!canUseStorage()) return;
  try {
    if (!userId) {
      window.localStorage.removeItem(PROFILE_CACHE_KEY);
      return;
    }
    const stored = readStoredCache();
    if (stored?.userId === userId) {
      window.localStorage.removeItem(PROFILE_CACHE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}
