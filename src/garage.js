import { clamp } from "./util.js";

/**
 * Four chassis with genuinely different balance. `art` is the showroom render;
 * on-track bodies are drawn from `body` so they can rotate freely.
 */
export const CAR_SPECS = [
  {
    id: "hatch",
    name: "海線鋼砲",
    blurb: "好上手：加速快、抓地穩，極速普通。",
    art: "./assets/art/car-hatch.png",
    body: { length: 4.2, width: 2.0, hue: "#f0603c", roof: "#2c3f52" },
    base: { topSpeed: 49, accel: 24, brake: 34, turnRate: 2.35, lateral: 20.5, armor: 100 },
  },
  {
    id: "kart",
    name: "小卡丁",
    blurb: "彎道之王：轉向極靈、抗撞差，直線吃虧。",
    art: "./assets/art/car-kart.png",
    body: { length: 3.2, width: 1.9, hue: "#ff9ec4", roof: "#f5f7fb" },
    base: { topSpeed: 44, accel: 26, brake: 38, turnRate: 3.0, lateral: 24, armor: 78 },
  },
  {
    id: "race",
    name: "方程式",
    blurb: "極速機器：直線無敵，車體脆、低速笨重。",
    art: "./assets/art/car-race.png",
    body: { length: 4.8, width: 2.0, hue: "#ff4d4d", roof: "#1d2733" },
    base: { topSpeed: 58, accel: 27, brake: 40, turnRate: 2.15, lateral: 22, armor: 72 },
  },
  {
    id: "future",
    name: "未來原型",
    blurb: "全能：均衡且耐撞，改裝後上限最高。",
    art: "./assets/art/car-future.png",
    body: { length: 4.6, width: 2.2, hue: "#4d7cff", roof: "#12203a" },
    base: { topSpeed: 53, accel: 25, brake: 36, turnRate: 2.4, lateral: 21.5, armor: 112 },
  },
];

export function carSpec(id) {
  return CAR_SPECS.find((c) => c.id === id) || CAR_SPECS[0];
}

export const UPGRADES = [
  { id: "engine", name: "引擎", hint: "極速 +4%／級", max: 5, cost: 240 },
  { id: "tyres", name: "輪胎", hint: "橫向抓地 +6%／級", max: 5, cost: 220 },
  { id: "brakes", name: "煞車", hint: "煞車力 +8%、轉向 +2%／級", max: 5, cost: 180 },
  { id: "nitro", name: "氮氣", hint: "推力更強、更省／級", max: 5, cost: 200 },
  { id: "chassis", name: "車架", hint: "耐撞 +18%／級", max: 5, cost: 260 },
];

export function upgradeDef(id) {
  return UPGRADES.find((u) => u.id === id);
}

/** Costs climb per level so a full build is a multi-cup project. */
export function upgradeCost(id, level) {
  const def = upgradeDef(id);
  if (!def) return Infinity;
  if (level >= def.max) return Infinity;
  return Math.round(def.cost * (1 + level * 0.55));
}

export function emptyUpgrades() {
  return { engine: 0, tyres: 0, brakes: 0, nitro: 0, chassis: 0 };
}

export function newProgress() {
  return {
    credits: 320,
    car: "hatch",
    upgrades: emptyUpgrades(),
    cupWins: 0,
    races: 0,
    unlocked: ["hatch", "kart"],
  };
}

export const CAR_PRICES = { hatch: 0, kart: 0, race: 900, future: 1500 };

export function normalizeProgress(raw) {
  const base = newProgress();
  if (!raw || typeof raw !== "object") return base;
  const upgrades = emptyUpgrades();
  for (const def of UPGRADES) {
    const v = Number(raw.upgrades?.[def.id]);
    upgrades[def.id] = Number.isFinite(v) ? clamp(Math.floor(v), 0, def.max) : 0;
  }
  const unlocked = Array.isArray(raw.unlocked)
    ? raw.unlocked.filter((id) => CAR_SPECS.some((c) => c.id === id))
    : base.unlocked;
  const merged = {
    credits: Number.isFinite(Number(raw.credits)) ? Math.max(0, Math.floor(Number(raw.credits))) : base.credits,
    car: CAR_SPECS.some((c) => c.id === raw.car) ? raw.car : base.car,
    upgrades,
    cupWins: Number.isFinite(Number(raw.cupWins)) ? Math.max(0, Math.floor(Number(raw.cupWins))) : 0,
    races: Number.isFinite(Number(raw.races)) ? Math.max(0, Math.floor(Number(raw.races))) : 0,
    unlocked: unlocked.length ? Array.from(new Set([...base.unlocked, ...unlocked])) : base.unlocked,
  };
  if (!merged.unlocked.includes(merged.car)) merged.car = merged.unlocked[0];
  return merged;
}

/** Turn a chassis plus upgrade levels into the numbers the physics step reads. */
export function tuningFor(spec, upgrades = emptyUpgrades(), aiSkill = 1) {
  const u = { ...emptyUpgrades(), ...upgrades };
  const armor = spec.base.armor * (1 + u.chassis * 0.18);
  return {
    topSpeed: spec.base.topSpeed * (1 + u.engine * 0.04) * aiSkill,
    accel: spec.base.accel * (1 + u.engine * 0.03) * aiSkill,
    brake: spec.base.brake * (1 + u.brakes * 0.08),
    turnRate: spec.base.turnRate * (1 + u.brakes * 0.02),
    lateral: spec.base.lateral * (1 + u.tyres * 0.06) * aiSkill,
    reverseSpeed: 9,
    nitroPower: 1.24 + u.nitro * 0.035,
    nitroDrain: 34 - u.nitro * 2.6,
    armor,
    armorScale: armor / 100,
  };
}

export function buyUpgrade(progress, id) {
  const def = upgradeDef(id);
  if (!def) return { ok: false, reason: "unknown", progress };
  const level = progress.upgrades[id] ?? 0;
  if (level >= def.max) return { ok: false, reason: "maxed", progress };
  const cost = upgradeCost(id, level);
  if (progress.credits < cost) return { ok: false, reason: "credits", progress };
  return {
    ok: true,
    cost,
    progress: {
      ...progress,
      credits: progress.credits - cost,
      upgrades: { ...progress.upgrades, [id]: level + 1 },
    },
  };
}

export function buyCar(progress, id) {
  const spec = CAR_SPECS.find((c) => c.id === id);
  if (!spec) return { ok: false, reason: "unknown", progress };
  if (progress.unlocked.includes(id)) {
    return { ok: true, cost: 0, progress: { ...progress, car: id } };
  }
  const cost = CAR_PRICES[id] ?? Infinity;
  if (progress.credits < cost) return { ok: false, reason: "credits", progress };
  return {
    ok: true,
    cost,
    progress: {
      ...progress,
      credits: progress.credits - cost,
      car: id,
      unlocked: [...progress.unlocked, id],
    },
  };
}

/** Prize money: podium first, then a bonus for bringing the car back intact. */
export function raceReward({ place, outcome, damage = 0, laps = 0 }) {
  if (outcome === "retired") return 40 + laps * 10;
  if (outcome === "timeout") return 60 + laps * 12;
  const podium = [260, 190, 140, 100];
  const base = podium[Math.min(place - 1, podium.length - 1)] ?? 80;
  const clean = damage < 15 ? 90 : damage < 45 ? 45 : 0;
  return base + clean;
}

export const CUP_POINTS = [10, 7, 5, 3];

export function cupPoints(place) {
  if (!Number.isFinite(place) || place < 1) return 0;
  return CUP_POINTS[place - 1] ?? 1;
}

export function createCup(trackIds) {
  return { rounds: trackIds, index: 0, results: [], points: {} };
}

/** Fold one round's finishing order into the running cup table. */
export function scoreRound(points, order) {
  const next = { ...points };
  order.forEach((entry, i) => {
    const place = entry.place ?? i + 1;
    next[entry.id] = (next[entry.id] ?? 0) + cupPoints(place);
  });
  return next;
}

export function cupTable(points, names) {
  return Object.entries(points)
    .map(([id, pts]) => ({ id, name: names[id] ?? id, points: pts }))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
}

export function cupOutcome(points, playerId) {
  const table = cupTable(points, {});
  if (!table.length) return { place: null, won: false };
  const place = table.findIndex((row) => row.id === playerId) + 1;
  return { place: place || null, won: place === 1 };
}
