import { TAU, clamp, lerp } from "./util.js";
import { SURFACE } from "./track.js";

const ART = {
  grass: "./assets/art/terrain-grass.png",
  sand: "./assets/art/terrain-sand.png",
  tree: "./assets/art/tree-green.png",
  treeBrown: "./assets/art/tree-brown.png",
  barrel: "./assets/art/barrel.png",
  barricade: "./assets/art/barricade.png",
  fence: "./assets/art/fence-red.png",
  fenceAlt: "./assets/art/fence-yellow.png",
  oil: "./assets/art/oil.png",
  smoke: "./assets/art/smoke.png",
};

export function loadArt(make = (src) => Object.assign(new Image(), { src })) {
  const out = {};
  for (const [key, src] of Object.entries(ART)) out[key] = make(src);
  return out;
}

const TILE_METRES = 26;

/** Skid marks and smoke live in world space and fade out on their own clock. */
export function createEffects(limits = { marks: 900, puffs: 160 }) {
  return { marks: [], puffs: [], limits };
}

export function emitSkid(effects, x, y, angle, strength) {
  effects.marks.push({ x, y, angle, life: 6, alpha: clamp(strength / 14, 0.08, 0.42) });
  if (effects.marks.length > effects.limits.marks) effects.marks.shift();
}

export function emitPuff(effects, x, y, vx, vy, size, tint) {
  effects.puffs.push({ x, y, vx, vy, size, life: 0.75, max: 0.75, tint });
  if (effects.puffs.length > effects.limits.puffs) effects.puffs.shift();
}

export function updateEffects(effects, dt) {
  for (let i = effects.marks.length - 1; i >= 0; i -= 1) {
    effects.marks[i].life -= dt;
    if (effects.marks[i].life <= 0) effects.marks.splice(i, 1);
  }
  for (let i = effects.puffs.length - 1; i >= 0; i -= 1) {
    const p = effects.puffs[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.94;
    p.vy *= 0.94;
    p.size += dt * 9;
    if (p.life <= 0) effects.puffs.splice(i, 1);
  }
  return effects;
}

export function createCamera() {
  return { x: 0, y: 0, zoom: 5.4 };
}

/** Follow the car with a speed-scaled look-ahead and pull the zoom out as it flies. */
export function updateCamera(camera, car, dt, viewMin) {
  const lead = clamp(car.speed * 0.55, 0, 34);
  const tx = car.x + Math.cos(car.angle) * lead;
  const ty = car.y + Math.sin(car.angle) * lead;
  const k = clamp(dt * 6.5, 0, 1);
  camera.x = lerp(camera.x, tx, k);
  camera.y = lerp(camera.y, ty, k);
  const base = clamp(viewMin / 88, 3.2, 7);
  const target = base * (1 - clamp(car.speed / 90, 0, 0.28));
  camera.zoom = lerp(camera.zoom, target, clamp(dt * 2.4, 0, 1));
  return camera;
}

function tileTerrain(ctx, img, view, offset = 0) {
  if (!img?.complete || !img.naturalWidth) return false;
  const startX = Math.floor((view.x0 - offset) / TILE_METRES) * TILE_METRES + offset;
  const startY = Math.floor((view.y0 - offset) / TILE_METRES) * TILE_METRES + offset;
  // Slight overlap hides seams once the camera lands on fractional pixels.
  const bleed = 0.2;
  for (let x = startX; x < view.x1; x += TILE_METRES) {
    for (let y = startY; y < view.y1; y += TILE_METRES) {
      ctx.drawImage(img, x, y, TILE_METRES + bleed, TILE_METRES + bleed);
    }
  }
  return true;
}

function visibleRange(track, view) {
  // Which centreline samples fall inside the padded viewport.
  const pad = track.width / 2 + track.runoff + 24;
  const inside = [];
  const n = track.samples.length;
  for (let i = 0; i < n; i += 1) {
    const p = track.samples[i];
    if (p.x > view.x0 - pad && p.x < view.x1 + pad && p.y > view.y0 - pad && p.y < view.y1 + pad) {
      inside.push(i);
    }
  }
  if (!inside.length) return [];
  // Group into contiguous runs so strokes are not chopped mid-corner.
  const runs = [];
  let run = [inside[0]];
  for (let k = 1; k < inside.length; k += 1) {
    if (inside[k] === inside[k - 1] + 1) run.push(inside[k]);
    else {
      runs.push(run);
      run = [inside[k]];
    }
  }
  runs.push(run);
  if (runs.length > 1 && runs[0][0] === 0 && runs[runs.length - 1][runs[runs.length - 1].length - 1] === n - 1) {
    const first = runs.shift();
    runs[runs.length - 1] = runs[runs.length - 1].concat(first);
  }
  return runs;
}

function strokeRun(ctx, track, run, widthMetres, style, dash = null) {
  ctx.beginPath();
  for (let k = 0; k < run.length; k += 1) {
    const p = track.samples[run[k] % track.samples.length];
    if (k === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.lineWidth = widthMetres;
  ctx.strokeStyle = style;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (dash) ctx.setLineDash(dash);
  ctx.stroke();
  if (dash) ctx.setLineDash([]);
}

function drawStartLine(ctx, track) {
  const p = track.samples[0];
  const half = track.width / 2;
  const rows = 4;
  const cols = 8;
  const cell = track.width / cols;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(Math.atan2(p.ty, p.tx));
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      ctx.fillStyle = (r + c) % 2 === 0 ? "#f4f6fb" : "#1c2431";
      ctx.fillRect(-rows * cell * 0.5 + r * cell, -half + c * cell, cell, cell);
    }
  }
  ctx.restore();
}

function drawProps(ctx, track, art, view) {
  for (const prop of track.props) {
    if (prop.x < view.x0 - 30 || prop.x > view.x1 + 30 || prop.y < view.y0 - 30 || prop.y > view.y1 + 30) {
      continue;
    }
    const img = art[prop.kind === "treeBrown" ? "treeBrown" : prop.kind] || art.tree;
    const size = (prop.art ?? prop.r * 2) * (prop.scale ?? 1);
    ctx.save();
    ctx.translate(prop.x, prop.y);
    if (prop.angle) ctx.rotate(prop.angle);
    if (img?.complete && img.naturalWidth) {
      ctx.drawImage(img, -size / 2, -size / 2, size, size);
    } else {
      ctx.fillStyle = prop.solid ? "#d94f4f" : "#2f6b45";
      ctx.beginPath();
      ctx.arc(0, 0, prop.r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawCar(ctx, car, isPlayer) {
  const spec = car.spec?.body ?? { length: 4.3, width: 2, hue: car.color, roof: "#243043" };
  const L = spec.length;
  const W = spec.width;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);

  ctx.fillStyle = "rgba(6, 12, 20, 0.32)";
  roundRect(ctx, -L / 2 + 0.3, -W / 2 + 0.5, L, W, 0.7);
  ctx.fill();

  ctx.fillStyle = "#161d28";
  const wheelL = L * 0.24;
  const wheelW = W * 0.22;
  for (const [wx, wy] of [
    [L * 0.28, -W / 2],
    [L * 0.28, W / 2],
    [-L * 0.3, -W / 2],
    [-L * 0.3, W / 2],
  ]) {
    ctx.save();
    ctx.translate(wx, wy);
    if (wx > 0) ctx.rotate(clamp((car.steerVisual ?? 0) * 0.5, -0.5, 0.5));
    ctx.fillRect(-wheelL / 2, -wheelW / 2, wheelL, wheelW);
    ctx.restore();
  }

  ctx.fillStyle = car.retired ? "#6c7480" : spec.hue;
  roundRect(ctx, -L / 2, -W / 2 + 0.18, L, W - 0.36, 0.9);
  ctx.fill();
  ctx.fillStyle = spec.roof;
  roundRect(ctx, -L * 0.16, -W * 0.3, L * 0.42, W * 0.6, 0.5);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.fillRect(L * 0.42, -W * 0.32, 0.35, W * 0.16);
  ctx.fillRect(L * 0.42, W * 0.16, 0.35, W * 0.16);
  ctx.fillStyle = "#101822";
  ctx.fillRect(-L / 2 - 0.25, -W * 0.42, 0.3, W * 0.84);

  if (car.boosting) {
    const flame = 1.6 + Math.random() * 1.6;
    const grad = ctx.createLinearGradient(-L / 2 - flame, 0, -L / 2, 0);
    grad.addColorStop(0, "rgba(94, 210, 255, 0)");
    grad.addColorStop(1, "rgba(150, 240, 255, 0.85)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-L / 2, -W * 0.26);
    ctx.lineTo(-L / 2 - flame, 0);
    ctx.lineTo(-L / 2, W * 0.26);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  if (isPlayer) {
    ctx.save();
    ctx.strokeStyle = "rgba(255, 236, 130, 0.75)";
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    ctx.arc(car.x, car.y, L * 0.85, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function drawRace(ctx, canvas, state, camera, art, effects, dpr) {
  const cssW = canvas.width / dpr;
  const cssH = canvas.height / dpr;
  const track = state.track;
  const halfW = cssW / (2 * camera.zoom);
  const halfH = cssH / (2 * camera.zoom);
  const view = { x0: camera.x - halfW, x1: camera.x + halfW, y0: camera.y - halfH, y1: camera.y + halfH };

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = track.theme.sky;
  ctx.fillRect(0, 0, cssW, cssH);
  ctx.save();
  ctx.translate(cssW / 2, cssH / 2);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);

  const terrain = track.theme.terrain === "sand" ? art.sand : art.grass;
  if (!tileTerrain(ctx, terrain, view)) {
    ctx.fillStyle = track.theme.grass;
    ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
  }

  const runs = visibleRange(track, view);
  const half = track.width / 2;
  for (const run of runs) {
    strokeRun(ctx, track, run, track.width + track.runoff * 2 + 3.4, "#1b2230");
    strokeRun(ctx, track, run, track.width + track.runoff * 2, track.theme.terrain === "sand" ? "#c9a86f" : "#3f7d55");
    strokeRun(ctx, track, run, track.width + 1.6, "#e8ecf2");
    strokeRun(ctx, track, run, track.width + 1.6, "#d2453f", [5, 5]);
    strokeRun(ctx, track, run, track.width - track.kerb * 2, "#39424f");
  }

  ctx.globalAlpha = 0.5;
  for (const mark of effects.marks) {
    ctx.save();
    ctx.translate(mark.x, mark.y);
    ctx.rotate(mark.angle);
    ctx.fillStyle = `rgba(18, 20, 26, ${mark.alpha * clamp(mark.life / 6, 0, 1)})`;
    ctx.fillRect(-1.1, -0.85, 2.2, 0.5);
    ctx.fillRect(-1.1, 0.35, 2.2, 0.5);
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  for (const run of runs) {
    strokeRun(ctx, track, run, 0.45, "rgba(232, 238, 248, 0.5)", [7, 9]);
  }
  drawStartLine(ctx, track);
  drawProps(ctx, track, art, view);

  for (const car of state.cars) {
    if (car.isPlayer) continue;
    drawCar(ctx, car, false);
  }
  const you = state.cars.find((c) => c.isPlayer);
  if (you) drawCar(ctx, you, true);

  for (const puff of effects.puffs) {
    const t = clamp(puff.life / puff.max, 0, 1);
    ctx.globalAlpha = t * 0.55;
    if (art.smoke?.complete && art.smoke.naturalWidth) {
      ctx.drawImage(art.smoke, puff.x - puff.size / 2, puff.y - puff.size / 2, puff.size, puff.size);
    } else {
      ctx.fillStyle = puff.tint || "rgba(226,232,240,0.7)";
      ctx.beginPath();
      ctx.arc(puff.x, puff.y, puff.size / 2, 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

export function drawMinimap(ctx, canvas, state, dpr) {
  const track = state.track;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  const b = track.bounds;
  const pad = 6;
  const scale = Math.min((w - pad * 2) / (b.maxX - b.minX), (h - pad * 2) / (b.maxY - b.minY));
  const ox = w / 2 - ((b.minX + b.maxX) / 2) * scale;
  const oy = h / 2 - ((b.minY + b.maxY) / 2) * scale;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.beginPath();
  track.samples.forEach((p, i) => {
    const x = ox + p.x * scale;
    const y = oy + p.y * scale;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.strokeStyle = "rgba(226,232,240,0.55)";
  ctx.lineWidth = Math.max(2.5, track.width * scale * 0.85);
  ctx.lineCap = "round";
  ctx.stroke();
  for (const car of state.cars) {
    ctx.beginPath();
    ctx.arc(ox + car.x * scale, oy + car.y * scale, car.isPlayer ? 3.4 : 2.4, 0, TAU);
    ctx.fillStyle = car.isPlayer ? "#ffe066" : car.color;
    ctx.fill();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** One-frame effect spawning driven by the physics state. */
export function spawnCarEffects(effects, car, dt) {
  const sliding = car.slip > 3.4;
  const looseGround = car.surface === SURFACE.GRASS || car.surface === SURFACE.SAND;
  if (sliding && !looseGround) {
    emitSkid(effects, car.x, car.y, car.angle, car.slip);
  }
  if ((sliding || looseGround) && car.speed > 6 && Math.random() < dt * 30) {
    const back = -Math.cos(car.angle) * 2.4;
    const backY = -Math.sin(car.angle) * 2.4;
    emitPuff(
      effects,
      car.x + back,
      car.y + backY,
      -car.vx * 0.12 + (Math.random() - 0.5) * 4,
      -car.vy * 0.12 + (Math.random() - 0.5) * 4,
      3.5,
      looseGround ? "rgba(214,190,140,0.8)" : "rgba(226,232,240,0.75)",
    );
  }
  if (car.boosting && Math.random() < dt * 26) {
    emitPuff(effects, car.x - Math.cos(car.angle) * 3, car.y - Math.sin(car.angle) * 3, 0, 0, 2.4, "rgba(140,220,255,0.7)");
  }
}
