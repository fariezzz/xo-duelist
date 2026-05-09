export function formatRelativeLastSeen(iso: string | null | undefined): string {
  if (!iso) return "Recently";
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return "Recently";

  const diffMs = Date.now() - ts;
  if (diffMs < 0) return "Just now";

  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
