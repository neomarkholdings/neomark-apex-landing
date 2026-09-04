export const DISARM_MS = 15 * 60 * 1000;

export function rearmDeadline(now: number, armed: boolean): number | null {
  return armed ? null : now + DISARM_MS;
}

export function dueToRearm(
  now: number,
  armed: boolean,
  until: number | null | undefined,
): boolean {
  if (armed || until == null) {
    return false;
  }
  return now >= until;
}

export function formatRearmClock(msLeft: number): string {
  const total = Math.max(0, Math.ceil(msLeft / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
