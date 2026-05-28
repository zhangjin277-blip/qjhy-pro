export function formatDwellTime(enteredStatusAt: string): string {
  const ms = Date.now() - new Date(enteredStatusAt).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function dwellSeverity(enteredStatusAt: string): "ok" | "warn" | "danger" {
  const days = (Date.now() - new Date(enteredStatusAt).getTime()) / 86400000;
  if (days >= 2) return "danger";
  if (days >= 1) return "warn";
  return "ok";
}
