import { describe, expect, it } from "vitest";
import { DEAD_ZONE, createInputState, keysToInput, mergeInputs, normalizeStick, stickToDrive } from "../src/input.js";

describe("controls", () => {
  it("maps arrow and WASD keys onto the same control vector", () => {
    expect(keysToInput(["ArrowUp"]).throttle).toBe(1);
    expect(keysToInput(["w"]).throttle).toBe(1);
    expect(keysToInput(["ArrowLeft"]).steer).toBe(-1);
    expect(keysToInput(["d"]).steer).toBe(1);
    expect(keysToInput(["ArrowDown"]).brake).toBe(1);
    expect(keysToInput([" "]).handbrake).toBe(true);
    expect(keysToInput(["Shift"]).nitro).toBe(true);
  });

  it("cancels opposite steering keys and ignores unrelated ones", () => {
    expect(keysToInput(["ArrowLeft", "ArrowRight"]).steer).toBe(0);
    const idle = keysToInput(["q", "F5"]);
    expect(idle).toEqual(createInputState());
  });

  it("kills the dead zone so a resting thumb reads as straight ahead", () => {
    const tiny = normalizeStick(4, 0, 100, DEAD_ZONE);
    expect(tiny).toEqual({ x: 0, y: 0, force: 0 });
    const full = normalizeStick(200, 0, 100, DEAD_ZONE);
    expect(full.x).toBeCloseTo(1, 6);
    expect(full.force).toBeCloseTo(1, 6);
  });

  it("normalises the stick onto the unit circle", () => {
    const diag = normalizeStick(90, 90, 100, 0);
    expect(Math.hypot(diag.x, diag.y)).toBeLessThanOrEqual(1.0001);
    expect(diag.x).toBeCloseTo(diag.y, 6);
  });

  it("drives from the stick: forward is throttle, back is brake", () => {
    const push = stickToDrive({ x: 0.4, y: -0.9 }, false);
    expect(push.throttle).toBeGreaterThan(0.9);
    expect(push.brake).toBe(0);
    expect(push.steer).toBeCloseTo(0.4, 6);
    const pull = stickToDrive({ x: 0, y: 0.9 }, false);
    expect(pull.throttle).toBe(0);
    expect(pull.brake).toBeGreaterThan(0.9);
  });

  it("holds the throttle open in auto mode and still allows braking", () => {
    const cruise = stickToDrive({ x: -0.5, y: 0 }, true);
    expect(cruise.throttle).toBe(1);
    expect(cruise.brake).toBe(0);
    expect(cruise.steer).toBeCloseTo(-0.5, 6);
    expect(stickToDrive({ x: 0, y: 1 }, true).brake).toBeGreaterThan(0.9);
  });

  it("merges keyboard and touch without letting either exceed the range", () => {
    const merged = mergeInputs(
      { steer: 1, throttle: 0, brake: 1, handbrake: false, nitro: false },
      { steer: 1, throttle: 1, brake: 0, handbrake: true, nitro: true },
    );
    expect(merged.steer).toBe(1);
    expect(merged.throttle).toBe(1);
    expect(merged.brake).toBe(1);
    expect(merged.handbrake).toBe(true);
    expect(merged.nitro).toBe(true);
  });
});
