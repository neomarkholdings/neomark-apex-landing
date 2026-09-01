const SANCTUARY_IDENTIFIERS = [
  "neomark",
  "retroblazed",
  "/music",
  "/studio-projects",
] as const;

export const SANCTUARY_ABORT =
  "ERR_SANCTUARY_ZONE: Target resides in an immutable protected sector. Action aborted.";

export function isSanctuaryPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/").toLowerCase();
  return SANCTUARY_IDENTIFIERS.some((marker) => normalized.includes(marker));
}
