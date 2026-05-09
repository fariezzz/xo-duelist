export type UserStatus = "online" | "matchmaking" | "in_game" | "offline";

export const STATUS_LABEL: Record<UserStatus, string> = {
  online: "Online",
  matchmaking: "In Queue",
  in_game: "In Game",
  offline: "Offline",
};

export const STATUS_COLOR: Record<UserStatus, string> = {
  online: "#10b981",
  matchmaking: "#f59e0b",
  in_game: "#ef4444",
  offline: "#6b7280",
};

export function statusSortWeight(status: UserStatus): number {
  if (status === "online") return 0;
  if (status === "matchmaking") return 1;
  if (status === "in_game") return 2;
  return 3;
}

export function parseUserStatus(value: string | null | undefined): UserStatus {
  if (value === "online" || value === "matchmaking" || value === "in_game" || value === "offline") {
    return value;
  }
  return "offline";
}

