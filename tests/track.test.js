import { describe, expect, it } from "vitest";
import {
  SURFACE,
  TRACKS,
  buildTrack,
  curvatureAhead,
  lapFromDistance,
  nearestOnTrack,
  polarLoop,
  progressDelta,
  resampleClosed,
  sampleAt,
  startSlot,
  surfaceAt,
} from "../src/track.js";

const seawall = buildTrack(TRACKS[0]);

describe("track geometry", () => {
  it("keeps every generated circuit a simple closed loop", () => {
    for (const def of TRACKS) {
      const pts = polarLoop({ radiusX: def.radiusX, radiusY: def.radiusY, harmonics: def.harmonics, count: 64 });
      // Star-shaped means the radius never collapses through the origin.
      for (const p of pts) expect(Math.hypot(p.x, p.y)).toBeGreaterThan(20);
      expect(pts).toHaveLength(64);
    }
  });

  it("resamples a closed polyline to near-uniform spacing", () => {
    const square = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const { samples, length, spacing } = resampleClosed(square, 10);
    expect(length).toBeCloseTo(400, 5);
    expect(samples.length).toBe(40);
    for (let i = 1; i < samples.length; i += 1) {
      const d = Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y);
      expect(d).toBeLessThanOrEqual(spacing + 1e-6);
    }
  });

  it("builds tracks with arc-length ordered samples and a sane lap length", () => {
    for (const def of TRACKS) {
      const t = buildTrack(def);
      expect(t.length).toBeGreaterThan(600);
      expect(t.samples.length).toBeGreaterThan(100);
      for (let i = 1; i < t.samples.length; i += 1) {
        expect(t.samples[i].s).toBeGreaterThan(t.samples[i - 1].s);
      }
    }
  });

  it("classifies road, kerb, run-off and wall by distance from the centreline", () => {
    const p = seawall.samples[10];
    const half = seawall.width / 2;
    const at = (offset) => surfaceAt(seawall, p.x + p.nx * offset, p.y + p.ny * offset).kind;
    expect(at(0)).toBe(SURFACE.ROAD);
    expect(at(half - 1)).toBe(SURFACE.KERB);
    expect(at(half + 3)).toBe(SURFACE.SAND);
    expect(at(half + seawall.runoff + 6)).toBe(SURFACE.WALL);
  });

  it("finds the same nearest sample with and without a search hint", () => {
    const p = seawall.samples[64];
    const x = p.x + p.nx * 3;
    const y = p.y + p.ny * 3;
    const cold = nearestOnTrack(seawall, x, y);
    const warm = nearestOnTrack(seawall, x, y, 62);
    expect(warm.index).toBe(cold.index);
    expect(warm.dist).toBeCloseTo(cold.dist, 6);
  });

  it("reports the tighter corner when looking further ahead on the hairpin track", () => {
    const hairpin = buildTrack(TRACKS[1]);
    const short = curvatureAhead(hairpin, 0, 10);
    const long = curvatureAhead(hairpin, 0, hairpin.length / 2);
    expect(long).toBeGreaterThanOrEqual(short);
    expect(long).toBeGreaterThan(0.004);
  });

  it("wraps progress the short way and rejects impossible jumps", () => {
    const L = seawall.length;
    expect(progressDelta(seawall, L - 5, 5)).toBeCloseTo(10, 6);
    expect(progressDelta(seawall, 5, L - 5)).toBeCloseTo(-10, 6);
    expect(progressDelta(seawall, 0, L * 0.4)).toBe(0);
  });

  it("counts laps from accumulated distance, not from crossing coordinates", () => {
    expect(lapFromDistance(seawall, 0)).toBe(1);
    expect(lapFromDistance(seawall, seawall.length * 0.99)).toBe(1);
    expect(lapFromDistance(seawall, seawall.length * 1.01)).toBe(2);
    expect(lapFromDistance(seawall, seawall.length * 2.5)).toBe(3);
  });

  it("places grid slots on the road behind the start line", () => {
    for (let i = 0; i < 4; i += 1) {
      const slot = startSlot(seawall, i);
      const probe = surfaceAt(seawall, slot.x, slot.y);
      expect([SURFACE.ROAD, SURFACE.KERB]).toContain(probe.kind);
      expect(probe.s).toBeGreaterThan(seawall.length * 0.9);
    }
  });

  it("keeps hazards off the racing line and oil slicks on it", () => {
    const harbour = buildTrack(TRACKS[2]);
    const half = harbour.width / 2;
    const solid = harbour.props.filter((p) => p.solid);
    const oil = harbour.props.filter((p) => p.kind === "oil");
    expect(solid.length).toBeGreaterThan(0);
    expect(oil.length).toBeGreaterThan(0);
    for (const p of solid) {
      // The whole body, not just the centre, has to sit off the racing surface.
      expect(nearestOnTrack(harbour, p.x, p.y).dist - p.r).toBeGreaterThan(half);
      expect(p.art).toBeLessThan(5);
    }
    for (const p of oil) {
      expect(nearestOnTrack(harbour, p.x, p.y).dist).toBeLessThan(half);
    }
  });

  it("samples by arc length consistently around the wrap point", () => {
    const a = sampleAt(seawall, 0);
    const b = sampleAt(seawall, seawall.length);
    expect(b.x).toBeCloseTo(a.x, 6);
    expect(b.y).toBeCloseTo(a.y, 6);
  });
});
