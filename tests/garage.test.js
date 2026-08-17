import { describe, expect, it } from "vitest";
import {
  CAR_SPECS,
  UPGRADES,
  buyCar,
  buyUpgrade,
  cupOutcome,
  cupPoints,
  cupTable,
  createCup,
  emptyUpgrades,
  newProgress,
  normalizeProgress,
  raceReward,
  scoreRound,
  tuningFor,
  upgradeCost,
} from "../src/garage.js";

describe("garage and cup", () => {
  it("raises upgrade prices with each level", () => {
    const first = upgradeCost("engine", 0);
    const second = upgradeCost("engine", 1);
    expect(second).toBeGreaterThan(first);
    expect(upgradeCost("engine", 5)).toBe(Infinity);
  });

  it("buys an upgrade only when the money is there", () => {
    const rich = { ...newProgress(), credits: 5000 };
    const bought = buyUpgrade(rich, "tyres");
    expect(bought.ok).toBe(true);
    expect(bought.progress.upgrades.tyres).toBe(1);
    expect(bought.progress.credits).toBe(5000 - bought.cost);

    const broke = { ...newProgress(), credits: 0 };
    const denied = buyUpgrade(broke, "tyres");
    expect(denied.ok).toBe(false);
    expect(denied.reason).toBe("credits");
    expect(denied.progress.upgrades.tyres).toBe(0);
  });

  it("stops at the maximum level", () => {
    let p = { ...newProgress(), credits: 99999 };
    const def = UPGRADES[0];
    for (let i = 0; i < def.max; i += 1) p = buyUpgrade(p, def.id).progress;
    expect(p.upgrades[def.id]).toBe(def.max);
    const extra = buyUpgrade(p, def.id);
    expect(extra.ok).toBe(false);
    expect(extra.reason).toBe("maxed");
  });

  it("charges for a locked car and switches free ones without cost", () => {
    const p = { ...newProgress(), credits: 2000 };
    const paid = buyCar(p, "future");
    expect(paid.ok).toBe(true);
    expect(paid.cost).toBeGreaterThan(0);
    expect(paid.progress.unlocked).toContain("future");
    const free = buyCar(paid.progress, "kart");
    expect(free.cost).toBe(0);
    expect(free.progress.car).toBe("kart");
    const poor = buyCar({ ...newProgress(), credits: 10 }, "race");
    expect(poor.ok).toBe(false);
  });

  it("turns upgrades into stronger tuning across every stat it claims", () => {
    const spec = CAR_SPECS[0];
    const stock = tuningFor(spec, emptyUpgrades());
    const full = tuningFor(spec, { engine: 5, tyres: 5, brakes: 5, nitro: 5, chassis: 5 });
    expect(full.topSpeed).toBeGreaterThan(stock.topSpeed);
    expect(full.lateral).toBeGreaterThan(stock.lateral);
    expect(full.brake).toBeGreaterThan(stock.brake);
    expect(full.armor).toBeGreaterThan(stock.armor);
    expect(full.nitroPower).toBeGreaterThan(stock.nitroPower);
    expect(full.nitroDrain).toBeLessThan(stock.nitroDrain);
  });

  it("keeps the four chassis genuinely different", () => {
    const tunings = CAR_SPECS.map((s) => tuningFor(s));
    const topSpeeds = tunings.map((t) => t.topSpeed);
    const turns = tunings.map((t) => t.turnRate);
    expect(new Set(topSpeeds).size).toBe(CAR_SPECS.length);
    expect(Math.max(...turns)).toBeGreaterThan(Math.min(...turns) * 1.2);
  });

  it("repairs damaged or hostile saved progress", () => {
    const fixed = normalizeProgress({ credits: -50, car: "nope", upgrades: { engine: 99, tyres: "x" }, unlocked: 5 });
    expect(fixed.credits).toBe(0);
    expect(fixed.unlocked).toContain(fixed.car);
    expect(fixed.upgrades.engine).toBe(5);
    expect(fixed.upgrades.tyres).toBe(0);
    expect(normalizeProgress(null)).toEqual(newProgress());
  });

  it("pays more for a podium and for bringing the car home clean", () => {
    const win = raceReward({ place: 1, outcome: "finished", damage: 0, laps: 3 });
    const winBent = raceReward({ place: 1, outcome: "finished", damage: 60, laps: 3 });
    const last = raceReward({ place: 4, outcome: "finished", damage: 0, laps: 3 });
    const wreck = raceReward({ place: 4, outcome: "retired", damage: 100, laps: 1 });
    expect(win).toBeGreaterThan(winBent);
    expect(win).toBeGreaterThan(last);
    expect(wreck).toBeLessThan(last);
  });

  it("awards descending cup points and adds them up across rounds", () => {
    expect(cupPoints(1)).toBeGreaterThan(cupPoints(2));
    expect(cupPoints(4)).toBeGreaterThan(0);
    expect(cupPoints(99)).toBe(1);
    let points = {};
    points = scoreRound(points, [
      { id: "player", place: 2 },
      { id: "ai0", place: 1 },
    ]);
    points = scoreRound(points, [
      { id: "player", place: 1 },
      { id: "ai0", place: 3 },
    ]);
    expect(points.player).toBe(cupPoints(2) + cupPoints(1));
    expect(points.ai0).toBe(cupPoints(1) + cupPoints(3));
    expect(points.player).toBeGreaterThan(points.ai0);
  });

  it("declares a cup champion only when the player tops the table", () => {
    const won = cupOutcome({ player: 30, ai0: 22 }, "player");
    expect(won).toEqual({ place: 1, won: true });
    const lost = cupOutcome({ player: 12, ai0: 22, ai1: 18 }, "player");
    expect(lost.won).toBe(false);
    expect(lost.place).toBe(3);
    const table = cupTable({ player: 12, ai0: 22 }, { player: "你", ai0: "阿義" });
    expect(table[0].name).toBe("阿義");
  });

  it("plans a cup over every track in order", () => {
    const cup = createCup(["a", "b", "c"]);
    expect(cup.rounds).toEqual(["a", "b", "c"]);
    expect(cup.index).toBe(0);
    expect(cup.results).toEqual([]);
  });
});
