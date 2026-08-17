import { clamp, formatTime, speedKmh } from "./src/util.js";
import { TRACKS, buildTrack, trackDef } from "./src/track.js";
import {
  CAR_PRICES,
  CAR_SPECS,
  UPGRADES,
  buyCar,
  buyUpgrade,
  carSpec,
  cupOutcome,
  cupTable,
  createCup,
  emptyUpgrades,
  newProgress,
  normalizeProgress,
  raceReward,
  scoreRound,
  tuningFor,
  upgradeCost,
} from "./src/garage.js";
import { PHASE, createRace, player, raceResult, standings, stepRace, timeRemaining } from "./src/race.js";
import { RIVAL_PROFILES } from "./src/ai.js";
import { GameAudio } from "./src/audio.js";
import { createStore } from "./src/persist.js";
import { ensureRecords, mergeRecord, boardRank } from "./src/leaderboard.js";
import {
  createCamera,
  createEffects,
  drawMinimap,
  drawRace,
  loadArt,
  spawnCarEffects,
  updateCamera,
  updateEffects,
} from "./src/render.js";
import { attachControls, normalizeStick } from "./src/input.js";

const $ = (sel) => document.querySelector(sel);
const PLAYER_NAME = "你";
const RIVAL_COUNT = 3;

const audio = new GameAudio();
const art = loadArt();
const store = createStore();
const effects = createEffects();
const camera = createCamera();
const trackCache = new Map();

let progress = newProgress();
let records = {};
let controls = null;
let race = null;
let cup = null;
let mode = "cup";
let paused = false;
let raceEnded = false;
let lastFrame = 0;
let rafId = 0;
let screen = "title";

function track(id) {
  if (!trackCache.has(id)) trackCache.set(id, buildTrack(trackDef(id)));
  return trackCache.get(id);
}

/* ------------------------------------------------------------------ chrome */

function show(name) {
  screen = name;
  for (const el of document.querySelectorAll(".screen")) {
    el.hidden = el.id !== `screen-${name}`;
  }
  $("#sound-toggle").hidden = name !== "title";
  if (name !== "race") stopLoop();
}

let toastTimer = 0;
function toast(text, ms = 2400) {
  const el = $("#toast");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, ms);
}

/** In-page confirmation — the project forbids native dialogs. */
let confirmResolve = null;
function askConfirm(title, text) {
  $("#confirm-title").textContent = title;
  $("#confirm-text").textContent = text;
  $("#confirm-panel").hidden = false;
  $("#confirm-yes").focus();
  return new Promise((resolve) => {
    confirmResolve = resolve;
  });
}
function closeConfirm(value) {
  $("#confirm-panel").hidden = true;
  const resolve = confirmResolve;
  confirmResolve = null;
  resolve?.(value);
}
$("#confirm-yes").addEventListener("click", () => closeConfirm(true));
$("#confirm-no").addEventListener("click", () => closeConfirm(false));

/* ------------------------------------------------------------- persistence */

async function saveProgress() {
  const res = await store.set("progress", progress);
  if (!res.ok) toast(`${res.error}（本場成績仍算）`);
  refreshTitle();
}

async function saveRecords(trackId) {
  const res = await store.set(`times:${trackId}`, records[trackId]);
  if (!res.ok) toast(res.error);
}

async function loadAll() {
  progress = normalizeProgress(await store.get("progress", null));
  for (const def of TRACKS) {
    const raw = await store.get(`times:${def.id}`, null);
    records[def.id] = ensureRecords(raw, def.id);
  }
  refreshTitle();
}

function refreshTitle() {
  $("#title-credits").textContent = progress.credits;
  $("#title-cups").textContent = progress.cupWins;
  $("#title-races").textContent = progress.races;
  $("#garage-credits").textContent = progress.credits;
}

/* ------------------------------------------------------------------ garage */

function renderGarage() {
  const grid = $("#car-grid");
  grid.replaceChildren();
  for (const spec of CAR_SPECS) {
    const owned = progress.unlocked.includes(spec.id);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "car-card";
    btn.setAttribute("aria-pressed", String(progress.car === spec.id));
    const img = document.createElement("img");
    img.src = spec.art;
    img.alt = "";
    const box = document.createElement("div");
    box.innerHTML = `<b>${spec.name}</b><small>${spec.blurb}</small>`;
    if (!owned) {
      const price = document.createElement("span");
      price.className = "price";
      price.textContent = `解鎖 ${CAR_PRICES[spec.id]} 資金`;
      box.append(price);
    }
    btn.append(img, box);
    btn.addEventListener("click", async () => {
      const result = buyCar(progress, spec.id);
      if (!result.ok) {
        toast(result.reason === "credits" ? "資金不足，先去比賽賺錢" : "無法選擇這輛車");
        return;
      }
      progress = result.progress;
      audio.play(result.cost > 0 ? "buy" : "click");
      await saveProgress();
      renderGarage();
    });
    grid.append(btn);
  }

  const list = $("#upgrade-list");
  list.replaceChildren();
  for (const def of UPGRADES) {
    const level = progress.upgrades[def.id] ?? 0;
    const cost = upgradeCost(def.id, level);
    const li = document.createElement("li");
    li.className = "upgrade-row";
    const info = document.createElement("div");
    info.innerHTML =
      `<span class="name">${def.name} <small>Lv.${level}/${def.max}</small></span>` +
      `<span class="hint">${def.hint}</span>`;
    const pips = document.createElement("div");
    pips.className = "pips";
    for (let i = 0; i < def.max; i += 1) {
      const pip = document.createElement("i");
      if (i < level) pip.className = "on";
      pips.append(pip);
    }
    info.append(pips);
    const buy = document.createElement("button");
    buy.type = "button";
    buy.className = "btn small";
    if (level >= def.max) {
      buy.textContent = "已滿級";
      buy.disabled = true;
    } else {
      buy.textContent = `升級 ${cost}`;
      buy.disabled = progress.credits < cost;
    }
    buy.addEventListener("click", async () => {
      const result = buyUpgrade(progress, def.id);
      if (!result.ok) {
        toast(result.reason === "credits" ? "資金不足" : "已達上限");
        return;
      }
      progress = result.progress;
      audio.play("buy");
      await saveProgress();
      renderGarage();
    });
    li.append(info, buy);
    list.append(li);
  }

  const spec = carSpec(progress.car);
  const t = tuningFor(spec, progress.upgrades);
  $("#spec-box").innerHTML = [
    `極速 <strong>${speedKmh(t.topSpeed)} km/h</strong>`,
    `加速 <strong>${t.accel.toFixed(1)} m/s²</strong>`,
    `煞車 <strong>${t.brake.toFixed(0)}</strong>`,
    `抓地 <strong>${t.lateral.toFixed(1)}</strong>`,
    `轉向 <strong>${t.turnRate.toFixed(2)} rad/s</strong>`,
    `耐撞 <strong>${t.armor.toFixed(0)}</strong>`,
  ]
    .map((s) => `<span>${s}</span>`)
    .join("");
  refreshTitle();
}

$("#reset-progress").addEventListener("click", async () => {
  const ok = await askConfirm("重置所有進度？", "資金、改裝、解鎖車輛與冠軍數都會清空。計時榜不受影響。");
  if (!ok) return;
  progress = newProgress();
  await saveProgress();
  renderGarage();
  toast("進度已重置");
});

/* ------------------------------------------------------- track / board UI */

function drawTrackThumb(canvas, def) {
  const t = track(def.id);
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = 64 * dpr;
  canvas.height = 64 * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const b = t.bounds;
  const scale = Math.min(56 / (b.maxX - b.minX), 56 / (b.maxY - b.minY));
  ctx.translate(32 - ((b.minX + b.maxX) / 2) * scale, 32 - ((b.minY + b.maxY) / 2) * scale);
  ctx.beginPath();
  t.samples.forEach((p, i) => (i ? ctx.lineTo(p.x * scale, p.y * scale) : ctx.moveTo(p.x * scale, p.y * scale)));
  ctx.closePath();
  ctx.strokeStyle = def.theme.tint;
  ctx.lineWidth = 3.2;
  ctx.lineJoin = "round";
  ctx.stroke();
}

function renderTracks() {
  const grid = $("#track-grid");
  grid.replaceChildren();
  for (const def of TRACKS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "track-card";
    const canvas = document.createElement("canvas");
    const box = document.createElement("div");
    const best = records[def.id]?.find((r) => r.name === PLAYER_NAME);
    box.innerHTML =
      `<b>${def.name}</b><small>${def.subtitle}</small>` +
      `<small>${def.laps} 圈 · 限時 ${formatTime(def.timeLimit)}</small>` +
      `<small>你的最佳 ${best ? formatTime(best.total) : "—"}</small>`;
    btn.append(canvas, box);
    grid.append(btn);
    drawTrackThumb(canvas, def);
    btn.addEventListener("click", () => {
      audio.play("click");
      startRace(def.id, "time");
    });
  }
}

function renderBoard() {
  const body = $("#board-body");
  body.replaceChildren();
  for (const def of TRACKS) {
    const block = document.createElement("div");
    block.className = "board-block";
    const rows = (records[def.id] || [])
      .map(
        (r, i) =>
          `<tr class="${r.name === PLAYER_NAME ? "you" : ""}"><td>${i + 1}</td><td>${r.name}</td>` +
          `<td>${formatTime(r.total)}</td><td>${r.lap ? formatTime(r.lap) : "—"}</td></tr>`,
      )
      .join("");
    block.innerHTML =
      `<h4>${def.name}</h4>` +
      `<table class="board-table"><thead><tr><th>#</th><th>車手</th><th>總時間</th><th>最速圈</th></tr></thead>` +
      `<tbody>${rows}</tbody></table>`;
    body.append(block);
  }
}

function renderCredits() {
  const list = $("#credits-list");
  list.replaceChildren();
  const items = [
    "地形／樹木／油桶／護欄／煙霧 — Kenney「Top-down Tanks Redux」— CC0",
    "車輛展示圖 — Kenney「Car Kit」— CC0",
    "獎牌 — Kenney「Medals」— CC0",
    "音效 — Kenney UI／Interface／Impact／Sci-fi／Casino Audio — CC0",
    "完賽號聲 — Kenney「Music Jingles」— CC0",
    "配樂 — Not Jam「Not Jam Music Pack」— CC0",
  ];
  for (const text of items) {
    const li = document.createElement("li");
    li.textContent = text;
    list.append(li);
  }
}

/* -------------------------------------------------------------------- race */

function resizeCanvas() {
  const canvas = $("#stage");
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width * dpr));
  const h = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const map = $("#minimap");
  const mrect = map.getBoundingClientRect();
  const mw = Math.max(1, Math.round(mrect.width * dpr));
  if (map.width !== mw) {
    map.width = mw;
    map.height = mw;
  }
  return dpr;
}

function startRace(trackId, kind) {
  mode = kind;
  const spec = carSpec(progress.car);
  race = createRace({
    track: track(trackId),
    playerSpec: spec,
    playerUpgrades: progress.upgrades,
    playerName: PLAYER_NAME,
    rivals: kind === "time" ? 0 : RIVAL_COUNT,
    mode: kind,
  });
  effects.marks.length = 0;
  effects.puffs.length = 0;
  const you = player(race);
  camera.x = you.x;
  camera.y = you.y;
  raceEnded = false;
  paused = false;
  $("#pause-panel").hidden = true;
  $("#result-panel").hidden = true;
  $("#hud-note").textContent = kind === "time" ? "計時賽：拚最速圈" : `${race.track.name} · ${race.laps} 圈`;
  show("race");
  audio.playMusic("race");
  audio.startEngine();
  controls?.clear();
  lastFrame = performance.now();
  startLoop();
}

function startLoop() {
  stopLoop();
  const frame = (now) => {
    rafId = requestAnimationFrame(frame);
    const dt = clamp((now - lastFrame) / 1000, 0, 0.05);
    lastFrame = now;
    if (!race) return;
    if (!paused && !raceEnded) tick(dt);
    draw(dt);
  };
  rafId = requestAnimationFrame(frame);
}

function stopLoop() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
}

function tick(dt) {
  const input = controls?.state ?? { steer: 0, throttle: 0, brake: 0, handbrake: false, nitro: false };
  stepRace(race, input, dt);
  for (const event of race.events) handleEvent(event);
  for (const car of race.cars) spawnCarEffects(effects, car, dt);
  updateEffects(effects, dt);
  const you = player(race);
  audio.updateEngine(
    clamp(you.speed / Math.max(you.tuning.topSpeed, 1), 0, 1),
    clamp(input.throttle + (you.boosting ? 0.4 : 0), 0, 1),
  );
  if (you.slip > 5 && you.speed > 10) audio.skid(performance.now());
  if (race.phase === PHASE.DONE && !raceEnded) void finishRace();
}

function handleEvent(event) {
  if (event.type === "count") {
    const el = $("#countdown");
    if (event.value > 0) {
      el.hidden = false;
      el.textContent = String(event.value);
      audio.play("count");
    } else {
      el.hidden = false;
      el.textContent = "GO!";
      audio.play("go");
      setTimeout(() => {
        el.hidden = true;
      }, 650);
    }
  } else if (event.type === "lap" && event.car.isPlayer) {
    audio.play("lap");
    $("#hud-note").textContent = `第 ${Math.min(event.lap, race.laps)} 圈 · 上一圈 ${formatTime(event.lapTime)}`;
  } else if (event.type === "crash") {
    if (event.car.isPlayer) audio.play(event.force > 10 ? "crash" : "scrape");
  } else if (event.type === "retire" && event.car.isPlayer) {
    audio.play("fail");
  } else if (event.type === "finish" && event.car.isPlayer) {
    audio.play("finish");
  }
}

function draw(dt) {
  const dpr = resizeCanvas();
  const canvas = $("#stage");
  const ctx = canvas.getContext("2d");
  const you = player(race);
  updateCamera(camera, you, paused ? 0 : dt, Math.min(canvas.width / dpr, canvas.height / dpr));
  drawRace(ctx, canvas, race, camera, art, effects, dpr);
  const map = $("#minimap");
  drawMinimap(map.getContext("2d"), map, race, dpr);

  const order = standings(race);
  $("#hud-lap").textContent = `${Math.min(you.lap, race.laps)}/${race.laps}`;
  $("#hud-place").textContent = `${order.indexOf(you) + 1}/${race.cars.length}`;
  const clock = race.phase === PHASE.COUNTDOWN ? 0 : race.clock;
  $("#hud-clock").textContent = formatTime(clock);
  $("#hud-speed").textContent = String(speedKmh(you.speed));
  $("#gauge-damage").style.width = `${clamp(100 - you.damage, 0, 100)}%`;
  $("#gauge-boost").style.width = `${clamp(you.boost, 0, 100)}%`;
  if (race.phase === PHASE.RACING && timeRemaining(race) < 20000) {
    $("#hud-note").textContent = `剩餘時間 ${formatTime(timeRemaining(race))}`;
  }
}

/* ------------------------------------------------------------- race result */

const MEDALS = ["./assets/art/medal-gold.png", "./assets/art/medal-silver.png", "./assets/art/medal-bronze.png"];

async function finishRace() {
  raceEnded = true;
  const result = raceResult(race);
  const reward = raceReward({
    place: result.place,
    outcome: result.outcome,
    damage: result.damage,
    laps: result.laps,
  });
  progress = { ...progress, credits: progress.credits + reward, races: progress.races + 1 };

  let boardNote = "";
  if (result.outcome === "finished") {
    const trackId = result.trackId;
    records[trackId] = mergeRecord(records[trackId], {
      name: PLAYER_NAME,
      total: Math.round(result.totalTime),
      lap: result.bestLap ? Math.round(result.bestLap) : null,
      at: Date.now(),
    });
    await saveRecords(trackId);
    const rank = boardRank(records[trackId], PLAYER_NAME);
    boardNote = rank ? `計時榜第 ${rank} 名` : "";
  }
  await saveProgress();

  if (mode === "cup" && cup) {
    cup.points = scoreRound(cup.points, result.order);
    cup.results.push(result);
    cup.index += 1;
  }
  audio.stopEngine();
  if (result.outcome === "finished" && result.place === 1) audio.playMusic("victory");
  showResult(result, reward, boardNote);
}

function outcomeLabel(result) {
  if (result.outcome === "retired") return { title: "車輛全毀", note: "耐久見底，本站淘汰。" };
  if (result.outcome === "timeout") return { title: "超過時限", note: "沒能在限時內完賽。" };
  if (result.place === 1) return { title: "第一名！", note: "完美收線。" };
  return { title: `第 ${result.place} 名`, note: "完賽了，還能更快。" };
}

function showResult(result, reward, boardNote) {
  const body = $("#result-body");
  const label = outcomeLabel(result);
  const medal = result.outcome === "finished" && result.place <= 3 ? MEDALS[result.place - 1] : null;
  body.replaceChildren();

  const head = document.createElement("div");
  head.className = "result-head";
  if (medal) {
    const img = document.createElement("img");
    img.src = medal;
    img.alt = "";
    head.append(img);
  }
  const heading = document.createElement("div");
  heading.innerHTML = `<div class="place">${label.title}</div><p>${label.note}</p>`;
  head.append(heading);

  const stats = document.createElement("ul");
  stats.className = "result-list";
  const rows = [
    `總時間 <b>${formatTime(result.totalTime)}</b>`,
    `最速圈 <b>${result.bestLap ? formatTime(result.bestLap) : "—"}</b>`,
    `完成圈數 <b>${result.laps}/${race.laps}</b>`,
    `車損 <b>${result.damage}%</b>`,
    `獎金 <b>+${reward}</b>`,
  ];
  if (boardNote) rows.push(`<b>${boardNote}</b>`);
  for (const row of rows) {
    const li = document.createElement("li");
    li.innerHTML = row;
    stats.append(li);
  }

  body.append(head, stats);

  if (mode === "cup") {
    const list = document.createElement("ol");
    list.className = "order-list";
    for (const entry of result.order) {
      const li = document.createElement("li");
      li.className = entry.id === "player" ? "you" : "";
      li.innerHTML = `<span>${entry.place}. ${entry.name}</span><span>${entry.retired ? "退賽" : ""}</span>`;
      list.append(li);
    }
    body.append(list);
  }

  const actions = document.createElement("div");
  actions.className = "panel-actions";
  if (mode === "cup" && cup) {
    const next = document.createElement("button");
    next.type = "button";
    next.className = "btn primary";
    next.textContent = cup.index >= cup.rounds.length ? "看盃賽結果" : "盃賽積分";
    next.addEventListener("click", () => {
      audio.play("click");
      $("#result-panel").hidden = true;
      showCup();
    });
    actions.append(next);
  } else {
    const again = document.createElement("button");
    again.type = "button";
    again.className = "btn primary";
    again.textContent = "再跑一次";
    again.addEventListener("click", () => {
      audio.play("click");
      startRace(result.trackId, mode);
    });
    const board = document.createElement("button");
    board.type = "button";
    board.className = "btn";
    board.textContent = "看計時榜";
    board.addEventListener("click", () => {
      audio.play("click");
      $("#result-panel").hidden = true;
      renderBoard();
      show("board");
      audio.playMusic("menu");
    });
    actions.append(again, board);
  }
  const home = document.createElement("button");
  home.type = "button";
  home.className = "btn ghost";
  home.textContent = "回主畫面";
  home.addEventListener("click", () => {
    audio.play("click");
    $("#result-panel").hidden = true;
    goTitle();
  });
  actions.append(home);
  body.append(actions);
  $("#result-panel").hidden = false;
}

/* --------------------------------------------------------------------- cup */

function rivalNames() {
  const names = { player: PLAYER_NAME };
  for (let i = 0; i < RIVAL_COUNT; i += 1) {
    names[`ai${i}`] = RIVAL_PROFILES[i % RIVAL_PROFILES.length].name;
  }
  return names;
}

function startCup() {
  cup = createCup(TRACKS.map((t) => t.id));
  mode = "cup";
  showCup();
}

function showCup() {
  const body = $("#cup-body");
  body.replaceChildren();
  const done = cup.index;
  const total = cup.rounds.length;
  const table = cupTable(cup.points, rivalNames());
  $("#cup-title").textContent = done >= total ? "盃賽結果" : `盃賽 ${done + 1}/${total} 站`;

  if (table.length) {
    const list = document.createElement("ol");
    list.className = "order-list";
    for (const row of table) {
      const li = document.createElement("li");
      li.className = row.id === "player" ? "you" : "";
      li.innerHTML = `<span>${row.name}</span><span>${row.points} 分</span>`;
      list.append(li);
    }
    body.append(list);
  }

  const schedule = document.createElement("ol");
  schedule.className = "cup-schedule";
  cup.rounds.forEach((id, i) => {
    const def = trackDef(id);
    const li = document.createElement("li");
    li.className = i < done ? "done" : i === done ? "now" : "";
    li.innerHTML = `<span>${def.name}</span><span>${i < done ? "已完賽" : i === done ? "本站" : `${def.laps} 圈`}</span>`;
    schedule.append(li);
  });
  body.append(schedule);

  const next = $("#cup-next");
  if (done >= total) {
    const outcome = cupOutcome(cup.points, "player");
    const summary = document.createElement("p");
    if (outcome.won) {
      summary.innerHTML = "<strong>環島盃冠軍！</strong> 獎金 +600";
      const img = document.createElement("img");
      img.src = MEDALS[0];
      img.alt = "";
      img.width = 56;
      img.height = 56;
      body.prepend(img);
      audio.playMusic("victory");
    } else {
      summary.innerHTML = `<strong>總排名第 ${outcome.place ?? "-"}</strong> — 這次沒拿下冠軍，改裝後再來。`;
    }
    body.append(summary);
    if (!cup.settled) {
      cup.settled = true;
      if (outcome.won) {
        progress = { ...progress, credits: progress.credits + 600, cupWins: progress.cupWins + 1 };
      }
      void saveProgress();
    }
    next.textContent = "回主畫面";
    next.onclick = () => {
      audio.play("click");
      goTitle();
    };
  } else {
    const def = trackDef(cup.rounds[done]);
    const note = document.createElement("p");
    note.textContent = `下一站：${def.name}（${def.subtitle}）· ${def.laps} 圈`;
    body.append(note);
    next.textContent = `前往 ${def.name}`;
    next.onclick = () => {
      audio.play("click");
      startRace(def.id, "cup");
    };
  }
  show("cup");
  audio.playMusic(done >= total && cupOutcome(cup.points, "player").won ? "victory" : "menu");
}

function goTitle() {
  race = null;
  cup = null;
  stopLoop();
  audio.stopEngine();
  refreshTitle();
  show("title");
  audio.playMusic("menu");
}

/* ---------------------------------------------------------------- wiring */

function togglePause(force) {
  if (!race || raceEnded) return;
  paused = force ?? !paused;
  $("#pause-panel").hidden = !paused;
  controls?.clear();
  if (paused) audio.stopEngine();
  else audio.startEngine();
}

$("#pause-btn").addEventListener("click", () => {
  audio.play("click");
  togglePause(true);
});
$("#resume-btn").addEventListener("click", () => {
  audio.play("click");
  togglePause(false);
});
$("#restart-btn").addEventListener("click", () => {
  audio.play("click");
  togglePause(false);
  startRace(race.track.id, mode);
});
$("#quit-btn").addEventListener("click", () => {
  audio.play("click");
  togglePause(false);
  goTitle();
});
$("#auto-throttle").addEventListener("change", (event) => {
  controls?.setAutoThrottle(event.target.checked);
});

$("#sound-toggle").addEventListener("click", () => {
  const on = audio.setEnabled(!audio.enabled);
  const btn = $("#sound-toggle");
  btn.textContent = on ? "♪ 音效開" : "♩ 靜音";
  btn.setAttribute("aria-pressed", String(on));
  if (on) audio.playMusic(screen === "race" ? "race" : "menu");
});

for (const el of document.querySelectorAll("[data-go]")) {
  el.addEventListener("click", () => {
    audio.play("click");
    const to = el.dataset.go;
    if (to === "cup") {
      startCup();
      return;
    }
    if (to === "timetrial") {
      renderTracks();
      show("tracks");
      return;
    }
    if (to === "garage") {
      renderGarage();
      show("garage");
      return;
    }
    if (to === "board") {
      renderBoard();
      show("board");
      return;
    }
    if (to === "credits") {
      renderCredits();
      show("credits");
      return;
    }
    goTitle();
  });
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden && race && !raceEnded) togglePause(true);
});
addEventListener("pagehide", () => {
  // Backgrounded for real: drop held inputs and silence audio, never keep driving.
  controls?.clear();
  audio.stopEngine();
  if (race && !raceEnded) togglePause(true);
});
addEventListener("resize", () => {
  if (race) resizeCanvas();
});

/* --------------------------------------------------------------- bootstrap */

async function waitForShell() {
  const pg = globalThis.PG;
  if (!pg?.ready) return null;
  try {
    await pg.ready;
    return pg;
  } catch {
    return null;
  }
}

/**
 * Prefer the shell's pinned nipplejs for the analog stick; the built-in pointer
 * stick stays as the fallback so the game also runs from a bare index.html.
 */
async function attachAnalogStick(pg) {
  if (!pg?.libs?.load) return;
  try {
    const nipplejs = await pg.libs.load("nipple");
    const manager = nipplejs.create({
      zone: $("#stick-zone"),
      mode: "dynamic",
      size: 104,
      restOpacity: 0.4,
    });
    $("#stick-knob").hidden = true;
    manager.on("move", (_evt, data) => {
      const force = Math.min(1, data.force ?? 0);
      const rad = data.angle?.radian ?? 0;
      controls.feedStick(normalizeStick(Math.cos(rad) * force, -Math.sin(rad) * force, 1));
    });
    manager.on("end", () => controls.feedStick({ x: 0, y: 0, force: 0 }));
  } catch {
    /* keep the built-in stick */
  }
}

async function boot() {
  controls = attachControls({
    zone: $("#stick-zone"),
    knob: $("#stick-knob"),
    pedals: {
      gas: $("#pedal-gas"),
      brake: $("#pedal-brake"),
      nitro: $("#pedal-nitro"),
    },
    onPause: () => togglePause(),
    onRestart: () => race && startRace(race.track.id, mode),
  });
  const coarse = matchMedia?.("(pointer: coarse)")?.matches ?? false;
  controls.setAutoThrottle(coarse);
  $("#auto-throttle").checked = coarse;
  if (!coarse) $("#touch-layer").classList.add("coarse-only");

  const pg = await waitForShell();
  await loadAll();
  await attachAnalogStick(pg);
  show("title");
  const unlock = () => {
    audio.playMusic("menu");
    removeEventListener("pointerdown", unlock);
    removeEventListener("keydown", unlock);
  };
  addEventListener("pointerdown", unlock, { once: false });
  addEventListener("keydown", unlock, { once: false });
}

void boot();
