import { clamp } from "./util.js";
import { NEUTRAL_INPUT, createCar, resolveCarContacts, stepCar } from "./physics.js";
import { lapFromDistance, nearestOnTrack, progressDelta, startSlot } from "./track.js";
import { RIVAL_PROFILES, aiInput } from "./ai.js";
import { tuningFor } from "./garage.js";

export const PHASE = {
  COUNTDOWN: "countdown",
  RACING: "racing",
  DONE: "done",
};

export const COUNTDOWN_MS = 3200;
export const RETIRE_DAMAGE = 100;

/**
 * A race is the whole structured world: the track, every car with its own lap
 * ledger, the clock, and the pending events the shell turns into sound.
 */
export function createRace({ track, playerSpec, playerUpgrades, playerName = "你", rivals = 3, mode = "cup" }) {
  const cars = [];
  const playerTuning = tuningFor(playerSpec, playerUpgrades);
  const slots = [];
  for (let i = 0; i < rivals + 1; i += 1) slots.push(startSlot(track, i));
  const playerSlot = slots[Math.min(rivals, slots.length - 1)];
  cars.push(
    createCar({
      id: "player",
      name: playerName,
      color: playerSpec.body.hue,
      isPlayer: true,
      tuning: playerTuning,
      x: playerSlot.x,
      y: playerSlot.y,
      angle: playerSlot.angle,
    }),
  );
  for (let i = 0; i < rivals; i += 1) {
    const profile = RIVAL_PROFILES[i % RIVAL_PROFILES.length];
    const skill = track.aiSkill * (0.94 + i * 0.03);
    const slot = slots[i];
    const car = createCar({
      id: `ai${i}`,
      name: profile.name,
      color: profile.color,
      tuning: tuningFor(playerSpec, playerUpgrades, skill),
      x: slot.x,
      y: slot.y,
      angle: slot.angle,
    });
    car.profile = profile;
    cars.push(car);
  }
  for (const car of cars) {
    const near = nearestOnTrack(track, car.x, car.y);
    car.s = near.s;
    car.hint = near.index;
    car.spec = playerSpec;
    // Negative until the nose reaches the line, so lap 2 ticks over exactly there.
    car.distance = -(track.length - near.s);
  }
  return {
    track,
    mode,
    cars,
    laps: track.laps,
    timeLimit: track.timeLimit,
    clock: 0,
    phase: PHASE.COUNTDOWN,
    countdown: COUNTDOWN_MS,
    lastBeep: null,
    outcome: null,
    events: [],
    finishOrder: [],
  };
}

function pushEvent(state, event) {
  state.events.push(event);
}

/** Lap bookkeeping from accumulated arc length, so corner cuts cannot bank a lap. */
export function advanceProgress(state, car) {
  const { track } = state;
  const near = nearestOnTrack(track, car.x, car.y, car.hint);
  car.hint = near.index;
  const delta = progressDelta(track, car.s, near.s);
  car.s = near.s;
  car.distance += delta;
  const lap = clamp(lapFromDistance(track, car.distance), 1, state.laps + 1);
  if (lap > car.lap) {
    const lapTime = state.clock - car.lapStartedAt;
    car.lapTimes.push(lapTime);
    car.lapStartedAt = state.clock;
    car.lap = lap;
    pushEvent(state, { type: "lap", car, lap, lapTime });
    if (lap > state.laps) finishCar(state, car);
  } else if (lap < car.lap) {
    car.lap = lap;
  }
  return car;
}

function finishCar(state, car) {
  if (car.finished) return;
  car.finished = true;
  car.finishTime = state.clock;
  car.lap = state.laps;
  state.finishOrder.push(car.id);
  car.place = state.finishOrder.length;
  pushEvent(state, { type: "finish", car });
}

/** Live order: finishers first by finishing time, then everyone by distance run. */
export function standings(state) {
  return [...state.cars]
    .map((car) => ({ car, distance: car.distance }))
    .sort((a, b) => {
      const af = a.car.finished ? a.car.place : Infinity;
      const bf = b.car.finished ? b.car.place : Infinity;
      if (af !== bf) return af - bf;
      if (a.car.retired !== b.car.retired) return a.car.retired ? 1 : -1;
      return b.distance - a.distance;
    })
    .map((entry, i) => {
      entry.car.livePlace = i + 1;
      return entry.car;
    });
}

export function player(state) {
  return state.cars.find((c) => c.isPlayer);
}

function endRace(state, outcome) {
  if (state.phase === PHASE.DONE) return;
  const order = standings(state);
  order.forEach((car, i) => {
    if (!car.finished) car.place = i + 1;
  });
  state.phase = PHASE.DONE;
  state.outcome = outcome;
  pushEvent(state, { type: "raceEnd", outcome });
}

/**
 * Advance the whole field. `dt` is seconds; the caller clamps it so a paused tab
 * cannot teleport anyone through a barrier.
 */
export function stepRace(state, playerInput, dt) {
  state.events = [];
  if (state.phase === PHASE.DONE) return state;

  if (state.phase === PHASE.COUNTDOWN) {
    state.countdown -= dt * 1000;
    const remaining = Math.max(0, Math.ceil(state.countdown / 1000));
    if (remaining !== state.lastBeep) {
      state.lastBeep = remaining;
      pushEvent(state, { type: "count", value: remaining });
    }
    if (state.countdown <= 0) {
      state.phase = PHASE.RACING;
      state.countdown = 0;
      for (const car of state.cars) car.lapStartedAt = 0;
    } else {
      // Engines idle on the grid: no throttle, but the world still ticks.
      for (const car of state.cars) stepCar(car, NEUTRAL_INPUT, dt, state.track);
      return state;
    }
  }

  state.clock += dt * 1000;
  for (const car of state.cars) {
    if (car.retired) continue;
    const input = car.finished
      ? { ...NEUTRAL_INPUT, brake: 0.4 }
      : car.isPlayer
        ? playerInput
        : aiInput(car, state.track, car.profile, state.clock / 1000);
    car.steerVisual = input.steer || 0;
    stepCar(car, input, dt, state.track);
    if (car.impact > 3) pushEvent(state, { type: "crash", car, force: car.impact });
    if (car.damage >= RETIRE_DAMAGE && !car.finished) {
      car.retired = true;
      pushEvent(state, { type: "retire", car });
    }
    if (!car.finished) advanceProgress(state, car);
  }
  for (const contact of resolveCarContacts(state.cars)) {
    pushEvent(state, { type: "bump", force: contact.force });
  }

  const you = player(state);
  if (you.finished) endRace(state, "finished");
  else if (you.retired) endRace(state, "retired");
  else if (state.clock >= state.timeLimit) endRace(state, "timeout");
  return state;
}

export function bestLap(car) {
  if (!car.lapTimes.length) return null;
  return Math.min(...car.lapTimes);
}

export function raceResult(state) {
  const you = player(state);
  const order = standings(state);
  return {
    trackId: state.track.id,
    outcome: state.outcome,
    place: you.place ?? order.indexOf(you) + 1,
    laps: Math.min(you.lap, state.laps),
    lapTimes: [...you.lapTimes],
    bestLap: bestLap(you),
    totalTime: you.finishTime ?? state.clock,
    damage: Math.round(you.damage),
    order: order.map((car) => ({ id: car.id, name: car.name, place: car.place, retired: car.retired })),
  };
}

export function timeRemaining(state) {
  return Math.max(0, state.timeLimit - state.clock);
}
