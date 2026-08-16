/** pg-islandloop — 環島賽 (競速) */

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function mulberry32(a) {
  return function() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function deep(o) { return JSON.parse(JSON.stringify(o)); }


export function createGame({ seed = 1, track = 0, upgrades = { speed: 0, handling: 0 } } = {}) {
  return { seed, track, upgrades, lap: 1, progress: 0, time: 0, best: null, nitro: 3, outcome: "playing", msg: "三圈完賽。加速／漂移。" };
}
export function getLegalActions(s) {
  if (s.outcome !== "playing") return [];
  return ["accel", "drift", "nitro"];
}
export function applyAction(state, action) {
  const s = deep(state);
  if (s.outcome !== "playing") return s;
  const spd = 8 + s.upgrades.speed * 2;
  const hand = 1 + s.upgrades.handling * 0.15;
  let gain = action === "accel" ? spd : action === "drift" ? spd * 0.7 * hand : spd * 1.6;
  if (action === "nitro") {
    if (s.nitro <= 0) { s.msg = "氮氣用完"; return s; }
    s.nitro--;
  }
  s.progress += gain;
  s.time += 1;
  if (s.progress >= 100) {
    s.progress = 0;
    s.lap++;
    s.msg = `完成第 ${s.lap - 1} 圈`;
    if (s.lap > 3) {
      s.outcome = "won";
      s.best = s.time;
      s.msg = `完賽！用時 ${s.time} 拍`;
    }
  } else s.msg = action === "drift" ? "漂移過彎" : action === "nitro" ? "氮氣加速！" : "直線催速";
  return s;
}
export function summarize(s) {
  return { lap: s.lap, progress: Math.floor(s.progress), time: s.time, nitro: s.nitro, msg: s.msg, outcome: s.outcome, upgrades: s.upgrades };
}
export function getOutcome(s) { return s.outcome; }

