import { describe, expect, it } from "vitest";
import { TRACKS, buildTrack, surfaceAt, SURFACE } from "../src/track.js";
import { CAR_SPECS, emptyUpgrades } from "../src/garage.js";
import { PHASE, createRace, player, stepRace } from "../src/race.js";

const IDLE = { steer: 0, throttle: 0, brake: 0, handbrake: false, nitro: false };

/**
 * End-to-end sanity for every circuit: a full field of rivals has to actually
 * get round, at a believable pace, without wrecking itself on the scenery.
 */
function simulate(def, seconds) {
  const track = buildTrack(def);
  const state = createRace({
    track,
    playerSpec: CAR_SPECS[0],
    playerUpgrades: emptyUpgrades(),
    rivals: 3,
  });
  const dt = 1 / 30;
  for (let i = 0; i < Math.round(seconds / dt); i += 1) {
    stepRace(state, IDLE, dt);
    if (state.phase === PHASE.DONE) break;
  }
  return { track, state };
}

describe.each(TRACKS.map((def) => [def.name, def]))("%s", (_name, def) => {
  const { track, state } = simulate(def, def.timeLimit / 1000 + 5);

  it("runs to a decided outcome inside the time limit", () => {
    expect(state.phase).toBe(PHASE.DONE);
    expect(["finished", "retired", "timeout"]).toContain(state.outcome);
  });

  it("has the rivals complete laps at a believable pace", () => {
    const rivals = state.cars.filter((c) => !c.isPlayer);
    const laps = rivals.flatMap((c) => c.lapTimes);
    expect(laps.length).toBeGreaterThan(0);
    for (const lap of laps) {
      expect(lap).toBeGreaterThan(12000);
      expect(lap).toBeLessThan(120000);
    }
    expect(Math.max(...rivals.map((c) => c.lap))).toBeGreaterThanOrEqual(2);
  });

  it("keeps every car inside the barriers for the whole race", () => {
    for (const car of state.cars) {
      const probe = surfaceAt(track, car.x, car.y);
      expect(probe.dist).toBeLessThanOrEqual(track.width / 2 + track.runoff + 0.5);
      expect(probe.kind).not.toBe(SURFACE.WALL);
    }
  });

  it("does not wreck the whole field on the scenery", () => {
    const rivals = state.cars.filter((c) => !c.isPlayer);
    expect(rivals.some((c) => !c.retired)).toBe(true);
  });

  it("leaves a parked player behind the field", () => {
    const you = player(state);
    const best = Math.max(...state.cars.filter((c) => !c.isPlayer).map((c) => c.distance));
    expect(best).toBeGreaterThan(you.distance);
  });
});
