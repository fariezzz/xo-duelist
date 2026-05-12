export type UserStatus = "online" | "in_room" | "matchmaking" | "in_game" | "offline";

export const PRESENCE_STALE_MS = 2 * 60 * 1000;

export const STATUS_LABEL: Record<UserStatus, string> = {
  online: "Online",
  in_room: "In Room",
  matchmaking: "In Queue",
  in_game: "In Game",
  offline: "Offline",
};

export const STATUS_COLOR: Record<UserStatus, string> = {
  online: "#10b981",
  in_room: "#38bdf8",
  matchmaking: "#f59e0b",
  in_game: "#ef4444",
  offline: "#6b7280",
};

export function statusSortWeight(status: UserStatus): number {
  if (status === "online") return 0;
  if (status === "in_room") return 1;
  if (status === "matchmaking") return 2;
  if (status === "in_game") return 3;
  return 4;
}

export function parseUserStatus(value: string | null | undefined): UserStatus {
  if (
    value === "online" ||
    value === "in_room" ||
    value === "matchmaking" ||
    value === "in_game" ||
    value === "offline"
  ) {
    return value;
  }
  return "offline";
}

export function isPresenceStale(lastSeen: string | null | undefined, now = Date.now()): boolean {
  if (!lastSeen) return true;
  const seenAt = new Date(lastSeen).getTime();
  if (!Number.isFinite(seenAt)) return true;
  return now - seenAt > PRESENCE_STALE_MS;
}

export function resolveUserStatusForPresence(
  storedStatus: string | null | undefined,
  lastSeen: string | null | undefined,
  options: {
    presenceReady?: boolean;
    liveStatus?: UserStatus;
    now?: number;
  } = {}
): UserStatus {
  const parsedStatus = parseUserStatus(storedStatus);

  if (options.presenceReady) {
    if (!options.liveStatus) return "offline";
    if (options.liveStatus !== "online") return options.liveStatus;
    return parsedStatus === "offline" ? "online" : parsedStatus;
  }

  if (parsedStatus !== "offline" && isPresenceStale(lastSeen, options.now)) {
    return "offline";
  }

  return parsedStatus;
}

