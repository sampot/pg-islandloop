export const TAU = Math.PI * 2;

export const clamp = (n, lo, hi) => (n < lo ? lo : n > hi ? hi : n);

export const lerp = (a, b, t) => a + (b - a) * t;

/** Shortest signed difference between two angles, in (-PI, PI]. */
export function angleDiff(target, current) {
  let d = (target - current) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

/** Deterministic 32-bit PRNG so tracks, fields and props replay identically. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function formatTime(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "--:--.---";
  const total = Math.round(ms);
  const m = Math.floor(total / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const frac = total % 1000;
  const body = `${String(s).padStart(2, "0")}.${String(frac).padStart(3, "0")}`;
  return m > 0 ? `${m}:${body}` : body;
}

export function formatDelta(ms) {
  if (!Number.isFinite(ms)) return "--";
  const sign = ms >= 0 ? "+" : "-";
  return sign + formatTime(Math.abs(ms));
}

/** World units are metres; the HUD speaks km/h. */
export const speedKmh = (metresPerSecond) => Math.round(metresPerSecond * 3.6);
