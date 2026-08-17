import { describe, expect, it } from "vitest";
import { TRACKS, buildTrack, curvatureAhead, nearestOnTrack, sampleAt } from "../src/track.js";
import { RIVAL_PROFILES, aiInput, cornerSpeed } from "../src/ai.js";
import { CAR_SPECS, tuningFor } from "../src/garage.js";
import { createCar } from "../src/physics.js";

const fast = buildTrack(TRACKS[0]);
const hairpin = buildTrack(TRACKS[1]);
const tuning = tuningFor(CAR_SPECS[0]);

function carAt(track, index, { lateral = 0, speed = 30, angleOffset = 0 } = {}) {
  const p = track.samples[index];
  const car = createCar({
    id: "ai",
    name: "ai",
    color: "#fff",
    tuning,
    x: p.x + p.nx * lateral,
    y: p.y + p.ny * lateral,
    angle: Math.atan2(p.ty, p.tx) + angleOffset,
  });
  car.speed = speed;
  car.vx = Math.cos(car.angle) * speed;
  car.vy = Math.sin(car.angle) * speed;
  const near = nearestOnTrack(track, car.x, car.y);
  car.s = near.s;
  car.hint = near.index;
  return car;
}

describe("rival driver", () => {
  it("derives corner speed from the grip budget", () => {
    expect(cornerSpeed(tuning, 0.02)).toBeLessThan(cornerSpeed(tuning, 0.004));
    expect(cornerSpeed(tuning, 0)).toBeGreaterThan(tuning.topSpeed);
    expect(cornerSpeed(tuning, 0.01, 1.2)).toBeGreaterThan(cornerSpeed(tuning, 0.01, 0.9));
  });

  it("steers back towards the road when pushed wide", () => {
    const profile = { line: 0, bravery: 1, lookahead: 1, mistake: 0 };
    const left = aiInput(carAt(fast, 40, { lateral: -9 }), fast, profile);
    const right = aiInput(carAt(fast, 40, { lateral: 9 }), fast, profile);
    expect(Math.sign(left.steer)).toBe(1);
    expect(Math.sign(right.steer)).toBe(-1);
  });

  it("corrects a car that is pointing the wrong way across the track", () => {
    const profile = { line: 0, bravery: 1, lookahead: 1, mistake: 0 };
    const skewed = aiInput(carAt(fast, 40, { angleOffset: 0.6 }), fast, profile);
    expect(skewed.steer).toBeLessThan(-0.3);
  });

  it("lifts and brakes for a corner that is too tight for its speed", () => {
    const profile = { line: 0, bravery: 1, lookahead: 1, mistake: 0 };
    let tightest = 0;
    let index = 0;
    hairpin.samples.forEach((p, i) => {
      const c = curvatureAhead(hairpin, p.s, 30);
      if (c > tightest) {
        tightest = c;
        index = i;
      }
    });
    const hot = aiInput(carAt(hairpin, index, { speed: 55 }), hairpin, profile);
    expect(hot.brake).toBeGreaterThan(0);
    expect(hot.throttle).toBe(0);
  });

  it("goes flat out down a straight and saves nitro for it", () => {
    const profile = { line: 0, bravery: 1, lookahead: 1, mistake: 0 };
    let flattest = Infinity;
    let index = 0;
    fast.samples.forEach((p, i) => {
      const c = curvatureAhead(fast, p.s, 60);
      if (c < flattest) {
        flattest = c;
        index = i;
      }
    });
    const car = carAt(fast, index, { speed: 45 });
    car.boost = 100;
    const cruise = aiInput(car, fast, profile);
    expect(cruise.throttle).toBe(1);
    expect(cruise.brake).toBe(0);
    expect(cruise.nitro).toBe(true);
  });

  it("aims each rival at its own line across the road", () => {
    const inner = RIVAL_PROFILES.find((p) => p.line < 0);
    const outer = RIVAL_PROFILES.find((p) => p.line > 0);
    const base = carAt(fast, 60, { speed: 25 });
    const target = sampleAt(fast, base.s + 40);
    const innerSteer = aiInput(base, fast, { ...inner, mistake: 0 }).steer;
    const outerSteer = aiInput(base, fast, { ...outer, mistake: 0 }).steer;
    expect(innerSteer).not.toBeCloseTo(outerSteer, 3);
    expect(Number.isFinite(target.x)).toBe(true);
  });

  it("returns steering within the control range for every sample on every track", () => {
    for (const track of [fast, hairpin]) {
      for (let i = 0; i < track.samples.length; i += 17) {
        const input = aiInput(carAt(track, i, { speed: 40 }), track, RIVAL_PROFILES[i % RIVAL_PROFILES.length], i);
        expect(input.steer).toBeGreaterThanOrEqual(-1);
        expect(input.steer).toBeLessThanOrEqual(1);
        expect(input.throttle).toBeGreaterThanOrEqual(0);
        expect(input.throttle).toBeLessThanOrEqual(1);
        expect(input.brake).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
