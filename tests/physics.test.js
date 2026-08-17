import { describe, expect, it } from "vitest";
import { SURFACE, buildTrack, nearestOnTrack, surfaceAt } from "../src/track.js";
import { NEUTRAL_INPUT, createCar, maxYawRate, resolveCarContacts, stepCar } from "../src/physics.js";
import { CAR_SPECS, tuningFor } from "../src/garage.js";

/** A stadium circuit with 1200 m straights, so a car can be tested in a line. */
function stadiumPoints(straight = 1200, radius = 300, arcSteps = 18) {
  const half = straight / 2;
  const pts = [];
  for (let i = 0; i <= 12; i += 1) pts.push({ x: -half + (straight * i) / 12, y: -radius });
  for (let i = 1; i < arcSteps; i += 1) {
    const a = -Math.PI / 2 + (Math.PI * i) / arcSteps;
    pts.push({ x: half + Math.cos(a) * radius, y: Math.sin(a) * radius });
  }
  for (let i = 0; i <= 12; i += 1) pts.push({ x: half - (straight * i) / 12, y: radius });
  for (let i = 1; i < arcSteps; i += 1) {
    const a = Math.PI / 2 + (Math.PI * i) / arcSteps;
    pts.push({ x: -half + Math.cos(a) * radius, y: Math.sin(a) * radius });
  }
  return pts;
}

const track = buildTrack({
  id: "test-oval",
  name: "測試橢圓",
  laps: 2,
  timeLimit: 300000,
  width: 40,
  runoff: 20,
  points: stadiumPoints(),
  seed: 3,
  treeDensity: 0,
  hazardDensity: 0,
  oilCount: 0,
  theme: { terrain: "grass", grass: "#2b8f5d", tint: "#8fd", sky: "#101820" },
});

const spec = CAR_SPECS[0];

/** Drop a car on the bottom straight, pointing down it. */
function makeCar({ lateral = 0, tuning = tuningFor(spec), x = -500 } = {}) {
  const car = createCar({
    id: "t",
    name: "test",
    color: "#fff",
    tuning,
    x,
    y: -300 + lateral,
    angle: 0,
  });
  car.spec = spec;
  const near = nearestOnTrack(track, car.x, car.y);
  car.s = near.s;
  car.hint = near.index;
  return car;
}

function drive(car, input, seconds, dt = 1 / 60) {
  for (let i = 0; i < Math.round(seconds / dt); i += 1) stepCar(car, { ...NEUTRAL_INPUT, ...input }, dt, track);
  return car;
}

function launch(speed, extra = {}) {
  const car = makeCar(extra);
  car.vx = speed;
  car.speed = speed;
  return car;
}

describe("car handling", () => {
  it("accelerates under throttle and settles near the tuned top speed", () => {
    const car = drive(makeCar(), { throttle: 1 }, 2);
    expect(car.speed).toBeGreaterThan(15);
    drive(car, { throttle: 1 }, 15);
    expect(car.speed).toBeLessThanOrEqual(car.tuning.topSpeed * 1.02);
    expect(car.speed).toBeGreaterThan(car.tuning.topSpeed * 0.85);
  });

  it("brakes far harder than it coasts", () => {
    const coast = drive(launch(40), {}, 1);
    const braked = drive(launch(40), { brake: 1 }, 1);
    expect(coast.speed).toBeGreaterThan(35);
    expect(braked.speed).toBeLessThan(coast.speed - 20);
  });

  it("does not steer a stationary car", () => {
    const car = makeCar();
    const angle = car.angle;
    drive(car, { steer: 1 }, 1);
    expect(Math.abs(car.angle - angle)).toBeLessThan(0.02);
  });

  it("turns when moving and never exceeds the grip-limited yaw rate", () => {
    const car = launch(35);
    drive(car, { throttle: 0.5, steer: 1 }, 0.8);
    expect(car.angle).toBeGreaterThan(0.05);
    expect(Math.abs(car.yaw)).toBeLessThanOrEqual(maxYawRate(car.tuning, car.speed) + 1e-6);
  });

  it("caps cornering harder as speed rises", () => {
    const t = tuningFor(spec);
    expect(maxYawRate(t, 60)).toBeLessThan(maxYawRate(t, 20));
    expect(maxYawRate(t, 5)).toBeCloseTo(t.turnRate, 6);
  });

  it("bogs down off the tarmac", () => {
    const onRoad = drive(makeCar(), { throttle: 1 }, 5);
    const offRoad = drive(makeCar({ lateral: 26 }), { throttle: 1 }, 5);
    expect(offRoad.surface).toBe(SURFACE.GRASS);
    expect(offRoad.speed).toBeLessThan(onRoad.speed * 0.75);
  });

  it("keeps the car inside the barriers and books damage on impact", () => {
    const car = launch(40);
    car.angle = Math.PI / 2; // straight at the outside wall
    car.vx = 0;
    car.vy = 40;
    drive(car, { throttle: 1 }, 3);
    const probe = surfaceAt(track, car.x, car.y);
    expect(probe.dist).toBeLessThanOrEqual(track.width / 2 + track.runoff + 0.1);
    expect(car.damage).toBeGreaterThan(0);
  });

  it("charges nitro while sliding and drains it while boosting", () => {
    const car = launch(38);
    car.boost = 0;
    drive(car, { throttle: 1, steer: 1, handbrake: true }, 1.2);
    expect(car.slip).toBeGreaterThan(1);
    const charged = car.boost;
    expect(charged).toBeGreaterThan(0);
    drive(car, { throttle: 1, nitro: true }, 0.3);
    expect(car.boosting).toBe(true);
    expect(car.boost).toBeLessThan(charged);
  });

  it("runs faster on nitro than on the engine alone", () => {
    const plain = drive(launch(40), { throttle: 1 }, 2.5);
    const boosted = launch(40);
    boosted.boost = 100;
    drive(boosted, { throttle: 1, nitro: true }, 2.5);
    expect(boosted.speed).toBeGreaterThan(plain.speed + 1);
    expect(boosted.boost).toBeLessThan(100);
  });

  it("stops boosting once the tank is empty", () => {
    const car = launch(40);
    car.boost = 5;
    drive(car, { throttle: 1, nitro: true }, 2);
    expect(car.boost).toBe(0);
    expect(car.boosting).toBe(false);
  });

  it("separates overlapping cars instead of letting them pass through", () => {
    const a = makeCar();
    const b = makeCar();
    b.x = a.x + 1;
    a.vx = 20;
    b.vx = -20;
    resolveCarContacts([a, b]);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThan(4.3);
    expect(a.damage + b.damage).toBeGreaterThan(0);
  });

  it("gives a stiffer chassis less damage from the same hit", () => {
    const hit = (tuning) => {
      const car = makeCar({ tuning });
      car.angle = Math.PI / 2;
      car.vy = 45;
      drive(car, { throttle: 1 }, 2);
      return car.damage;
    };
    const tough = hit(tuningFor(CAR_SPECS[3], { chassis: 5 }));
    const frail = hit(tuningFor(CAR_SPECS[2]));
    expect(tough).toBeLessThan(frail);
  });
});
