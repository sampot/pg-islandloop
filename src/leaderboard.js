import { TRACKS } from "./track.js";

export const RECORD_LIMIT = 6;

/**
 * Insert a lap/total pair into a per-track table, keeping the fastest few and
 * one row per driver name.
 */
export function mergeRecord(records, entry, limit = RECORD_LIMIT) {
  const clean = Array.isArray(records) ? records.filter(validRecord) : [];
  if (!validRecord(entry)) return clean.slice(0, limit);
  const others = clean.filter((r) => r.name !== entry.name);
  const mine = clean.find((r) => r.name === entry.name);
  const best = mine
    ? {
        name: entry.name,
        total: Math.min(mine.total, entry.total),
        lap: Math.min(mine.lap ?? Infinity, entry.lap ?? Infinity),
        at: entry.total <= mine.total ? entry.at : mine.at,
      }
    : { ...entry };
  if (!Number.isFinite(best.lap)) best.lap = null;
  return [...others, best].sort((a, b) => a.total - b.total).slice(0, limit);
}

function validRecord(r) {
  return Boolean(r) && typeof r.name === "string" && Number.isFinite(r.total) && r.total > 0;
}

/** Seed times so the board reads as a ladder before the player's first run. */
export function seedRecords(trackId) {
  const def = TRACKS.find((t) => t.id === trackId);
  if (!def) return [];
  const par = def.parTime;
  const laps = def.laps;
  return [
    { name: "阿義", total: Math.round(par * 0.98), lap: Math.round((par * 0.98) / laps), at: 0 },
    { name: "小葉", total: Math.round(par * 1.03), lap: Math.round((par * 1.03) / laps), at: 0 },
    { name: "老陳", total: Math.round(par * 1.09), lap: Math.round((par * 1.09) / laps), at: 0 },
  ];
}

export function ensureRecords(records, trackId) {
  const clean = Array.isArray(records) ? records.filter(validRecord) : [];
  if (clean.length) return clean.sort((a, b) => a.total - b.total).slice(0, RECORD_LIMIT);
  return seedRecords(trackId);
}

export function boardRank(records, name) {
  const idx = records.findIndex((r) => r.name === name);
  return idx < 0 ? null : idx + 1;
}
