import { describe, expect, it } from "vitest";
import { boardRank, ensureRecords, mergeRecord, seedRecords } from "../src/leaderboard.js";
import { createStore } from "../src/persist.js";
import { angleDiff, clamp, formatTime, mulberry32, speedKmh } from "../src/util.js";

describe("leaderboard", () => {
  it("sorts by total time and trims to the limit", () => {
    let list = [];
    for (const [name, total] of [
      ["a", 90000],
      ["b", 70000],
      ["c", 80000],
    ]) {
      list = mergeRecord(list, { name, total, lap: total / 3, at: 0 }, 2);
    }
    expect(list.map((r) => r.name)).toEqual(["b", "c"]);
  });

  it("keeps one row per driver and only improves it", () => {
    let list = mergeRecord([], { name: "你", total: 90000, lap: 31000, at: 1 });
    list = mergeRecord(list, { name: "你", total: 95000, lap: 29000, at: 2 });
    expect(list).toHaveLength(1);
    expect(list[0].total).toBe(90000);
    expect(list[0].lap).toBe(29000);
    list = mergeRecord(list, { name: "你", total: 85000, lap: 30000, at: 3 });
    expect(list[0].total).toBe(85000);
    expect(list[0].lap).toBe(29000);
  });

  it("rejects junk entries instead of poisoning the board", () => {
    const list = mergeRecord([{ name: "ok", total: 1000 }, null, { total: 5 }], { name: "x", total: NaN });
    expect(list).toEqual([{ name: "ok", total: 1000 }]);
  });

  it("seeds a ladder so the board is never empty", () => {
    const seeded = ensureRecords(null, "seawall");
    expect(seeded.length).toBeGreaterThan(0);
    for (let i = 1; i < seeded.length; i += 1) {
      expect(seeded[i].total).toBeGreaterThan(seeded[i - 1].total);
    }
    expect(seedRecords("nope")).toEqual([]);
    expect(boardRank(seeded, seeded[1].name)).toBe(2);
    expect(boardRank(seeded, "沒這人")).toBe(null);
  });
});

describe("persistence", () => {
  it("round-trips through an injected PG.kv", async () => {
    const kv = new Map();
    const store = createStore({
      pg: { kv: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => void kv.set(k, v) } },
      fetcher: null,
    });
    expect(await store.get("progress", "fallback")).toBe("fallback");
    const res = await store.set("progress", { credits: 42 });
    expect(res.ok).toBe(true);
    expect(await store.get("progress")).toEqual({ credits: 42 });
    expect([...kv.keys()][0]).toMatch(/^pg-islandloop:/);
  });

  it("falls back to the default /api/kv routes when no PG is present", async () => {
    const seen = [];
    const fetcher = async (url, opts) => {
      seen.push([url, opts?.method ?? "GET"]);
      return { ok: true, text: async () => JSON.stringify({ credits: 7 }) };
    };
    const store = createStore({ pg: undefined, fetcher });
    expect(await store.get("progress")).toEqual({ credits: 7 });
    await store.set("progress", { credits: 7 });
    expect(seen[1][1]).toBe("PUT");
    expect(seen[0][0]).toContain("/api/kv/");
  });

  it("reports a failed write rather than throwing at the caller", async () => {
    const store = createStore({
      pg: {
        kv: {
          get: async () => null,
          put: async () => {
            throw Object.assign(new Error("nope"), { code: "functions_no_leader" });
          },
        },
      },
      fetcher: null,
    });
    const res = await store.set("progress", { a: 1 });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("後端");
    // The value is still readable this session so the race is not lost.
    expect(await store.get("progress")).toEqual({ a: 1 });
  });
});

describe("helpers", () => {
  it("formats race clocks with and without minutes", () => {
    expect(formatTime(41500)).toBe("41.500");
    expect(formatTime(95250)).toBe("1:35.250");
    expect(formatTime(NaN)).toBe("--:--.---");
  });

  it("clamps, converts speed and wraps angles", () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(speedKmh(10)).toBe(36);
    expect(angleDiff(Math.PI * 1.9, 0)).toBeCloseTo(-Math.PI * 0.1, 6);
    expect(angleDiff(-Math.PI * 1.9, 0)).toBeCloseTo(Math.PI * 0.1, 6);
  });

  it("replays the same pseudo-random sequence for a seed", () => {
    const a = mulberry32(99);
    const b = mulberry32(99);
    const first = [a(), a(), a()];
    expect(first).toEqual([b(), b(), b()]);
    expect(first.every((n) => n >= 0 && n < 1)).toBe(true);
  });
});
