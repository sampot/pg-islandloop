import { clamp, angleDiff } from "./util.js";
import { curvatureAhead, sampleAt } from "./track.js";
import { SURFACE } from "./track.js";

/** Rival personalities: where they sit on the road and how brave they are. */
export const RIVAL_PROFILES = [
  { name: "阿義", color: "#ffd166", line: -0.42, bravery: 1.02, lookahead: 1.0, mistake: 0.02 },
  { name: "小葉", color: "#4ee1a0", line: 0.36, bravery: 0.97, lookahead: 1.12, mistake: 0.05 },
  { name: "老陳", color: "#c792ff", line: -0.1, bravery: 0.93, lookahead: 1.22, mistake: 0.08 },
  { name: "阿珠", color: "#7fd4ff", line: 0.5, bravery: 1.05, lookahead: 0.94, mistake: 0.03 },
];

/**
 * Fastest a car may take the corner it is looking at, from the grip budget:
 * v = sqrt(a_lat / curvature).
 */
export function cornerSpeed(tuning, curvature, bravery = 1) {
  if (curvature <= 1e-5) return tuning.topSpeed * 1.2;
  return Math.sqrt((tuning.lateral * 1.24 * bravery) / curvature);
}

/**
 * Chase a point down the road, offset onto this rival's preferred line, and
 * modulate the pedals against the corner it is about to reach.
 */
export function aiInput(car, track, profile, time = 0) {
  const speed = Math.max(car.speed, 0);
  const lookahead = clamp(14 + speed * 0.85 * (profile.lookahead ?? 1), 14, 110);
  const target = sampleAt(track, car.s + lookahead);
  const offset = (profile.line ?? 0) * (track.width * 0.5 - 4);
  const wobble = Math.sin(time * 0.7 + (profile.line ?? 0) * 9) * (profile.mistake ?? 0) * 8;
  const tx = target.x + target.nx * (offset + wobble);
  const ty = target.y + target.ny * (offset + wobble);
  const desired = Math.atan2(ty - car.y, tx - car.x);
  const steer = clamp(angleDiff(desired, car.angle) * 2.6, -1, 1);

  const curve = curvatureAhead(track, car.s + 8, clamp(speed * 1.7, 30, 130));
  const limit = Math.min(
    cornerSpeed(car.tuning, curve, profile.bravery ?? 1),
    car.tuning.topSpeed * 1.05,
  );
  let throttle = 1;
  let brake = 0;
  if (speed > limit * 1.05) {
    throttle = 0;
    brake = clamp((speed - limit) / 12, 0.25, 1);
  } else if (speed > limit * 0.94) {
    throttle = 0.45;
  }
  if (car.surface === SURFACE.GRASS || car.surface === SURFACE.SAND) {
    throttle = 0.7;
    brake = 0;
  }
  const straight = curve < 0.004;
  return {
    steer,
    throttle,
    brake,
    handbrake: false,
    nitro: straight && car.boost > 55 && speed > limit * 0.6,
  };
}
