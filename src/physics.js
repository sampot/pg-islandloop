import { clamp } from "./util.js";
import { SURFACE, SURFACE_GRIP, surfaceAt } from "./track.js";

export const NEUTRAL_INPUT = Object.freeze({
  steer: 0,
  throttle: 0,
  brake: 0,
  handbrake: false,
  nitro: false,
});

/**
 * Yaw rate the tyres can just about carry. Steering is allowed to ask for a bit
 * more than the grip circle (`OVERSTEER`), which is where the drift comes from.
 */
const OVERSTEER = 1.55;

export function maxYawRate(tuning, speed) {
  const gripYaw = (tuning.lateral * OVERSTEER) / Math.max(speed, 9);
  return Math.min(tuning.turnRate, gripYaw);
}

export function createCar({ id, name, color, isPlayer = false, tuning, x, y, angle }) {
  return {
    id,
    name,
    color,
    isPlayer,
    tuning,
    x,
    y,
    angle,
    vx: 0,
    vy: 0,
    speed: 0,
    slip: 0,
    yaw: 0,
    damage: 0,
    boost: 50,
    boosting: false,
    surface: SURFACE.ROAD,
    hint: null,
    distance: 0,
    s: 0,
    lap: 1,
    lapTimes: [],
    lapStartedAt: 0,
    finished: false,
    finishTime: null,
    retired: false,
    place: null,
    impact: 0,
    offTrackFor: 0,
  };
}

function propModifier(track, car) {
  let grip = 1;
  for (const prop of track.props) {
    if (!prop.grip) continue;
    const d2 = (prop.x - car.x) ** 2 + (prop.y - car.y) ** 2;
    if (d2 < (prop.r + 2) ** 2) grip = Math.min(grip, prop.grip);
  }
  return grip;
}

/** Solid props (barrels, barricades) push the car out and cost condition. */
export function resolvePropHits(track, car) {
  let damage = 0;
  for (const prop of track.props) {
    if (!prop.solid) continue;
    const dx = car.x - prop.x;
    const dy = car.y - prop.y;
    const min = prop.r + 2.1;
    const d = Math.hypot(dx, dy);
    if (d >= min || d === 0) continue;
    const nx = dx / d;
    const ny = dy / d;
    car.x = prop.x + nx * min;
    car.y = prop.y + ny * min;
    const closing = car.vx * nx + car.vy * ny;
    if (closing < 0) {
      car.vx -= closing * nx * 1.25;
      car.vy -= closing * ny * 1.25;
      damage += ((prop.damage || 10) * Math.min(1, Math.abs(closing) / 22)) / car.tuning.armorScale;
    }
    car.vx *= 0.82;
    car.vy *= 0.82;
  }
  if (damage > 0) {
    car.damage = clamp(car.damage + damage, 0, 100);
    car.impact = Math.max(car.impact, damage);
  }
  return damage;
}

/** Snap a car back inside the barriers, leaving its condition alone. */
export function clampInside(track, car, probe) {
  if (probe.kind !== SURFACE.WALL) return false;
  const p = probe.point;
  const sign = probe.lateral >= 0 ? 1 : -1;
  const limit = probe.limit - 0.4;
  car.x = p.x + p.nx * limit * sign;
  car.y = p.y + p.ny * limit * sign;
  return true;
}

/** Barrier contact: slide along the wall, bleed speed, take damage. */
export function resolveWallHit(track, car, probe) {
  if (!clampInside(track, car, probe)) return 0;
  const p = probe.point;
  const sign = probe.lateral >= 0 ? 1 : -1;
  const nx = -p.nx * sign;
  const ny = -p.ny * sign;
  const closing = car.vx * nx + car.vy * ny;
  let damage = 0;
  if (closing < 0) {
    const normal = -closing;
    car.vx -= closing * nx * 1.35;
    car.vy -= closing * ny * 1.35;
    // A glancing scrape is free; only a real thump costs condition.
    damage = clamp((normal - 7) * 1.45, 0, 100) / car.tuning.armorScale;
    car.damage = clamp(car.damage + damage, 0, 100);
    car.impact = Math.max(car.impact, damage);
  }
  car.vx *= 0.7;
  car.vy *= 0.7;
  return damage;
}

/**
 * One integration step of the arcade handling model: throttle along the nose,
 * yaw from steering, and a lateral friction budget that lets the tail step out
 * when it is exceeded.
 */
export function stepCar(car, input, dt, track) {
  const t = car.tuning;
  const probeBefore = surfaceAt(track, car.x, car.y, car.hint);
  car.hint = probeBefore.index;
  car.surface = probeBefore.kind;
  const ground = SURFACE_GRIP[probeBefore.kind] || SURFACE_GRIP[SURFACE.ROAD];
  const slickGrip = propModifier(track, car);

  const cos = Math.cos(car.angle);
  const sin = Math.sin(car.angle);
  let vf = car.vx * cos + car.vy * sin;
  let vl = -car.vx * sin + car.vy * cos;

  const wantsNitro = Boolean(input.nitro) && car.boost > 0 && input.throttle > 0;
  car.boosting = wantsNitro;
  const boostMul = wantsNitro ? t.nitroPower : 1;
  car.boost = clamp(car.boost + (wantsNitro ? -t.nitroDrain * dt : 0), 0, 100);

  const topSpeed = t.topSpeed * ground.speed * boostMul;
  const throttle = clamp(input.throttle || 0, 0, 1);
  const brake = clamp(input.brake || 0, 0, 1);

  if (throttle > 0) {
    const headroom = clamp(1 - vf / topSpeed, 0, 1);
    vf += t.accel * boostMul * throttle * headroom * dt;
  }
  if (brake > 0) {
    if (vf > 0.5) vf = Math.max(0, vf - t.brake * brake * dt);
    else vf = Math.max(-t.reverseSpeed, vf - t.accel * 0.55 * brake * dt);
  }
  vf -= vf * (0.06 + ground.drag * 0.9) * dt;
  if (vf > topSpeed) vf -= (vf - topSpeed) * Math.min(1, 3 * dt);

  const speed = Math.hypot(vf, vl);
  const steer = clamp(input.steer || 0, -1, 1);
  const authority = clamp(speed / 7, 0, 1);
  const direction = vf < -0.4 ? -1 : 1;
  const yaw = steer * maxYawRate(t, speed) * authority * direction;
  car.yaw = yaw;
  car.angle += yaw * dt;

  // Rotating the nose leaves velocity behind; friction pulls it back in line.
  const rotated = -yaw * dt;
  const nvf = vf * Math.cos(rotated) - vl * Math.sin(rotated);
  const nvl = vf * Math.sin(rotated) + vl * Math.cos(rotated);
  vf = nvf;
  vl = nvl;

  const gripScale = ground.grip * slickGrip * (input.handbrake ? 0.34 : 1);
  const budget = t.lateral * gripScale * dt;
  if (Math.abs(vl) <= budget) vl = 0;
  else vl -= Math.sign(vl) * budget;

  car.slip = Math.abs(vl);
  car.speed = Math.hypot(vf, vl);
  const ncos = Math.cos(car.angle);
  const nsin = Math.sin(car.angle);
  car.vx = vf * ncos - vl * nsin;
  car.vy = vf * nsin + vl * ncos;
  car.x += car.vx * dt;
  car.y += car.vy * dt;

  // Controlled slides feed the nitro tank; scraping the scenery does not.
  if (car.slip > 3 && probeBefore.kind !== SURFACE.WALL) {
    car.boost = clamp(car.boost + Math.min(car.slip, 12) * 1.6 * dt, 0, 100);
  }
  if (probeBefore.kind === SURFACE.GRASS || probeBefore.kind === SURFACE.SAND) {
    car.offTrackFor += dt;
  } else {
    car.offTrackFor = 0;
  }

  car.impact = 0;
  const probeAfter = surfaceAt(track, car.x, car.y, car.hint);
  car.hint = probeAfter.index;
  resolveWallHit(track, car, probeAfter);
  resolvePropHits(track, car);
  // A prop shove must never be able to post the car through the barrier.
  clampInside(track, car, surfaceAt(track, car.x, car.y, car.hint));
  return car;
}

/** Cars nudge each other rather than pass through. */
export function resolveCarContacts(cars) {
  const contacts = [];
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      if (a.retired || b.retired) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = 4.4;
      if (d >= min || d === 0) continue;
      const nx = dx / d;
      const ny = dy / d;
      const push = (min - d) / 2;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      const closing = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (closing < 0) {
        const j2 = closing * 0.6;
        a.vx += j2 * nx;
        a.vy += j2 * ny;
        b.vx -= j2 * nx;
        b.vy -= j2 * ny;
        const hurt = clamp((-closing - 6) * 0.5, 0, 12);
        a.damage = clamp(a.damage + hurt / a.tuning.armorScale, 0, 100);
        b.damage = clamp(b.damage + hurt / b.tuning.armorScale, 0, 100);
        if (hurt > 0) contacts.push({ a, b, force: hurt });
      }
    }
  }
  return contacts;
}
