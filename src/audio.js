import { clamp } from "./util.js";

const SFX = {
  click: { src: "./assets/audio/click.ogg", volume: 0.35 },
  buy: { src: "./assets/audio/buy.ogg", volume: 0.5 },
  count: { src: "./assets/audio/count.ogg", volume: 0.5 },
  go: { src: "./assets/audio/go.ogg", volume: 0.6 },
  lap: { src: "./assets/audio/lap.ogg", volume: 0.5 },
  crash: { src: "./assets/audio/crash.ogg", volume: 0.7 },
  scrape: { src: "./assets/audio/scrape.ogg", volume: 0.4 },
  skid: { src: "./assets/audio/skid.ogg", volume: 0.45 },
  nitro: { src: "./assets/audio/nitro.ogg", volume: 0.5 },
  finish: { src: "./assets/audio/finish.ogg", volume: 0.6 },
  fail: { src: "./assets/audio/fail.ogg", volume: 0.5 },
};

const MUSIC = {
  menu: { src: "./assets/audio/bgm-menu.ogg", volume: 0.3 },
  race: { src: "./assets/audio/bgm-race.ogg", volume: 0.26 },
  victory: { src: "./assets/audio/bgm-victory.ogg", volume: 0.34 },
};

/**
 * Thin wrapper over HTMLAudioElement: pooled one-shots, one looping music bed,
 * and an engine drone whose pitch tracks the revs.
 */
export class GameAudio {
  constructor(make = (src) => new Audio(src)) {
    this.enabled = true;
    this.make = make;
    this.pools = {};
    this.music = {};
    this.currentMusic = null;
    this.engine = null;
    this.lastSkid = 0;
    for (const [name, def] of Object.entries(SFX)) {
      this.pools[name] = Array.from({ length: 3 }, () => {
        const el = make(def.src);
        el.volume = def.volume;
        el.preload = "auto";
        return el;
      });
      this.pools[name].cursor = 0;
    }
    for (const [name, def] of Object.entries(MUSIC)) {
      const el = make(def.src);
      el.loop = true;
      el.volume = def.volume;
      this.music[name] = el;
    }
  }

  setEnabled(on) {
    this.enabled = Boolean(on);
    if (!this.enabled) {
      for (const el of Object.values(this.music)) el.pause();
      this.stopEngine();
    } else if (this.currentMusic) {
      this.playMusic(this.currentMusic);
    }
    return this.enabled;
  }

  play(name) {
    if (!this.enabled) return;
    const pool = this.pools[name];
    if (!pool) return;
    const el = pool[pool.cursor % pool.length];
    pool.cursor = (pool.cursor + 1) % pool.length;
    try {
      el.currentTime = 0;
      const p = el.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {
      /* autoplay blocked until the first gesture; harmless */
    }
  }

  playMusic(name) {
    this.currentMusic = name;
    for (const [key, el] of Object.entries(this.music)) {
      if (key !== name) {
        el.pause();
        el.currentTime = 0;
      }
    }
    if (!this.enabled) return;
    const el = this.music[name];
    if (!el) return;
    const p = el.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  }

  startEngine() {
    if (!this.enabled) return;
    if (!this.engine) {
      this.engine = this.make("./assets/audio/engine.ogg");
      this.engine.loop = true;
      this.engine.volume = 0;
      if ("preservesPitch" in this.engine) this.engine.preservesPitch = false;
      this.engine.mozPreservesPitch = false;
      this.engine.webkitPreservesPitch = false;
    }
    const p = this.engine.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  }

  stopEngine() {
    if (this.engine) this.engine.pause();
  }

  /** revs 0..1 plus load 0..1 drive pitch and level of the drone. */
  updateEngine(revs, load) {
    if (!this.engine || !this.enabled) return;
    this.engine.playbackRate = clamp(0.62 + revs * 1.55, 0.5, 2.6);
    this.engine.volume = clamp(0.12 + load * 0.26 + revs * 0.12, 0, 0.5);
  }

  /** Tyre chirp, rate limited so a long slide is not a machine-gun of samples. */
  skid(now) {
    if (now - this.lastSkid < 260) return;
    this.lastSkid = now;
    this.play("skid");
  }
}
