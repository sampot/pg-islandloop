import { describe, expect, it } from "vitest";
import { TRACKS, buildTrack } from "../src/track.js";
import { CAR_SPECS } from "../src/garage.js";
import {
  COUNTDOWN_MS,
  PHASE,
  advanceProgress,
  bestLap,
  createRace,
  player,
  raceResult,
  standings,
  stepRace,
  timeRemaining,
} from "../src/race.js";
import { emptyUpgrades } from "../src/garage.js";

const track = buildTrack(TRACKS[2]);

function newRace(overrides = {}) {
  return createRace({
    track,
    playerSpec: CAR_SPECS[0],
    playerUpgrades: emptyUpgrades(),
    rivals: 3,
    ...overrides,
  });
}

const FULL_THROTTLE = { steer: 0, throttle: 1, brake: 0, handbrake: false, nitro: false };
const IDLE = { steer: 0, throttle: 0, brake: 0, handbrake: false, nitro: false };

function run(state, input, seconds, dt = 1 / 60) {
  for (let i = 0; i < Math.round(seconds / dt); i += 1) {
    stepRace(state, input, dt);
    if (state.phase === PHASE.DONE) break;
  }
  return state;
}

describe("race state", () => {
  it("starts a structured field on the grid behind the line", () => {
    const state = newRace();
    expect(state.cars).toHaveLength(4);
    expect(state.cars.filter((c) => c.isPlayer)).toHaveLength(1);
    expect(state.phase).toBe(PHASE.COUNTDOWN);
    expect(state.laps).toBe(track.laps);
    for (const car of state.cars) {
      expect(car.lap).toBe(1);
      expect(car.lapTimes).toEqual([]);
      expect(Number.isFinite(car.s)).toBe(true);
    }
  });

  it("lines the grid up short of the line so lap two ticks at the line itself", () => {
    const state = newRace();
    for (const car of state.cars) {
      expect(car.distance).toBeLessThan(0);
      expect(car.distance).toBeGreaterThan(-45);
      expect(car.lap).toBe(1);
    }
    const you = player(state);
    // Nudge the field past the line: still lap 1, because a lap is a full circuit.
    you.distance = 5;
    expect(Math.floor(you.distance / track.length) + 1).toBe(1);
  });

  it("holds the clock at zero until the lights go out", () => {
    const state = newRace();
    run(state, FULL_THROTTLE, 1);
    expect(state.phase).toBe(PHASE.COUNTDOWN);
    expect(state.clock).toBe(0);
    run(state, FULL_THROTTLE, COUNTDOWN_MS / 1000);
    expect(state.phase).toBe(PHASE.RACING);
    expect(state.clock).toBeGreaterThan(0);
  });

  it("emits one countdown event per second", () => {
    const state = newRace();
    const seen = [];
    for (let i = 0; i < 260; i += 1) {
      stepRace(state, IDLE, 1 / 60);
      for (const e of state.events) if (e.type === "count") seen.push(e.value);
      if (state.phase === PHASE.RACING) break;
    }
    expect(seen).toEqual([4, 3, 2, 1, 0]);
  });

  it("records a lap time and fires a lap event when the line is crossed", () => {
    const state = newRace();
    run(state, IDLE, COUNTDOWN_MS / 1000 + 0.1);
    const you = player(state);
    state.clock = 41000;
    you.distance = track.length - 1;
    you.s = track.samples[track.samples.length - 1].s;
    const ahead = track.samples[2];
    you.x = ahead.x;
    you.y = ahead.y;
    state.events = [];
    advanceProgress(state, you);
    expect(you.lap).toBe(2);
    expect(you.lapTimes).toHaveLength(1);
    expect(you.lapTimes[0]).toBeGreaterThan(0);
    expect(state.events.some((e) => e.type === "lap")).toBe(true);
  });

  it("finishes the race and stamps a placing once the last lap is done", () => {
    const state = newRace();
    run(state, IDLE, COUNTDOWN_MS / 1000 + 0.1);
    const you = player(state);
    you.distance = track.length * state.laps - 1;
    you.s = track.samples[track.samples.length - 1].s;
    const ahead = track.samples[2];
    you.x = ahead.x;
    you.y = ahead.y;
    stepRace(state, IDLE, 1 / 60);
    expect(you.finished).toBe(true);
    expect(state.phase).toBe(PHASE.DONE);
    expect(state.outcome).toBe("finished");
    expect(you.place).toBe(1);
  });

  it("ranks the field by distance while the race is live", () => {
    const state = newRace();
    run(state, FULL_THROTTLE, COUNTDOWN_MS / 1000 + 0.5);
    const you = player(state);
    you.distance = 900;
    for (const car of state.cars) if (!car.isPlayer) car.distance = 100;
    expect(standings(state)[0]).toBe(you);
    you.distance = 10;
    expect(standings(state)[0]).not.toBe(you);
  });

  it("ends the race as retired when the car is wrecked", () => {
    const state = newRace();
    run(state, IDLE, COUNTDOWN_MS / 1000 + 0.1);
    const you = player(state);
    you.damage = 100;
    stepRace(state, IDLE, 1 / 60);
    expect(you.retired).toBe(true);
    expect(state.outcome).toBe("retired");
    expect(raceResult(state).outcome).toBe("retired");
  });

  it("ends the race as a timeout when the limit runs out", () => {
    const state = newRace();
    run(state, IDLE, COUNTDOWN_MS / 1000 + 0.1);
    state.clock = state.timeLimit - 10;
    expect(timeRemaining(state)).toBeLessThan(20);
    stepRace(state, IDLE, 1 / 60);
    expect(state.phase).toBe(PHASE.DONE);
    expect(state.outcome).toBe("timeout");
  });

  it("keeps the rivals driving: they cover ground and stay on the island", () => {
    const state = newRace();
    run(state, IDLE, 12);
    const rivals = state.cars.filter((c) => !c.isPlayer);
    for (const car of rivals) {
      expect(car.distance).toBeGreaterThan(60);
      expect(car.damage).toBeLessThan(100);
      expect(Number.isFinite(car.x)).toBe(true);
    }
    // A parked player should be last on the road.
    expect(standings(state).at(-1).isPlayer).toBe(true);
  });

  it("beats a parked player over a longer stint", () => {
    const state = newRace();
    run(state, IDLE, 40);
    const you = player(state);
    const leader = standings(state)[0];
    expect(leader).not.toBe(you);
    expect(leader.distance).toBeGreaterThan(you.distance + 200);
  });

  it("summarises the result with lap times and finishing order", () => {
    const state = newRace();
    run(state, IDLE, COUNTDOWN_MS / 1000 + 0.1);
    const you = player(state);
    you.lapTimes = [42000, 39500];
    you.damage = 100;
    stepRace(state, IDLE, 1 / 60);
    const result = raceResult(state);
    expect(bestLap(you)).toBe(39500);
    expect(result.bestLap).toBe(39500);
    expect(result.order).toHaveLength(4);
    expect(result.order.every((o) => Number.isFinite(o.place))).toBe(true);
    expect(result.trackId).toBe(track.id);
  });

  it("supports a solo time trial with no rivals", () => {
    const state = newRace({ rivals: 0, mode: "time" });
    expect(state.cars).toHaveLength(1);
    run(state, FULL_THROTTLE, 6);
    expect(player(state).distance).toBeGreaterThan(20);
  });
});
