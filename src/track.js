import { TAU, clamp, mulberry32 } from "./util.js";

export const SURFACE = {
  ROAD: "road",
  KERB: "kerb",
  GRASS: "grass",
  SAND: "sand",
  WALL: "wall",
};

/** Per-surface handling. `speed` scales top speed, `grip` scales lateral hold. */
export const SURFACE_GRIP = {
  [SURFACE.ROAD]: { grip: 1, speed: 1, drag: 0.02, rough: 0 },
  [SURFACE.KERB]: { grip: 0.82, speed: 0.96, drag: 0.1, rough: 1 },
  [SURFACE.GRASS]: { grip: 0.46, speed: 0.55, drag: 0.55, rough: 0.7 },
  [SURFACE.SAND]: { grip: 0.38, speed: 0.45, drag: 0.85, rough: 0.9 },
  [SURFACE.WALL]: { grip: 0.46, speed: 0.4, drag: 0.9, rough: 1 },
};

/**
 * Star-shaped closed loop from a radius harmonic series. Because r(theta) stays
 * positive the outline can never self-intersect, so generated circuits are
 * always drivable.
 */
export function polarLoop({ radiusX, radiusY, harmonics = [], count = 40, rotate = 0 }) {
  const pts = [];
  for (let i = 0; i < count; i += 1) {
    const t = (i / count) * TAU;
    let r = 1;
    for (const h of harmonics) r += h.amp * Math.cos(h.k * t + (h.phase || 0));
    const a = t + rotate;
    pts.push({ x: radiusX * r * Math.cos(a), y: radiusY * r * Math.sin(a) });
  }
  return pts;
}

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

/** Dense Catmull-Rom interpolation of a closed control polygon. */
export function smoothClosed(points, subdivisions = 16) {
  const n = points.length;
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    for (let j = 0; j < subdivisions; j += 1) {
      const t = j / subdivisions;
      out.push({ x: catmull(p0.x, p1.x, p2.x, p3.x, t), y: catmull(p0.y, p1.y, p2.y, p3.y, t) });
    }
  }
  return out;
}

/** Re-space a closed polyline so every sample sits `spacing` metres apart. */
export function resampleClosed(points, spacing) {
  const n = points.length;
  const seg = [];
  let total = 0;
  for (let i = 0; i < n; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    seg.push(len);
    total += len;
  }
  const count = Math.max(8, Math.round(total / spacing));
  const step = total / count;
  const out = [];
  let idx = 0;
  let carried = 0;
  for (let k = 0; k < count; k += 1) {
    const target = k * step;
    while (carried + seg[idx] < target && idx < n - 1) {
      carried += seg[idx];
      idx += 1;
    }
    const a = points[idx];
    const b = points[(idx + 1) % n];
    const t = seg[idx] > 0 ? (target - carried) / seg[idx] : 0;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, s: target });
  }
  return { samples: out, length: total, spacing: step };
}

function annotate(samples, length) {
  const n = samples.length;
  for (let i = 0; i < n; i += 1) {
    const prev = samples[(i - 1 + n) % n];
    const next = samples[(i + 1) % n];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    samples[i].tx = dx / len;
    samples[i].ty = dy / len;
    samples[i].nx = -samples[i].ty;
    samples[i].ny = samples[i].tx;
  }
  const ds = length / n;
  for (let i = 0; i < n; i += 1) {
    const prev = samples[(i - 1 + n) % n];
    const next = samples[(i + 1) % n];
    let d = Math.atan2(next.ty, next.tx) - Math.atan2(prev.ty, prev.tx);
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    samples[i].curv = Math.abs(d) / (2 * ds);
  }
  return samples;
}

function placeProps(track, def) {
  const rand = mulberry32(def.seed || 7);
  const props = [];
  const { samples, width, runoff } = track;
  const half = width / 2;
  const step = Math.max(3, Math.round(24 / track.spacing));
  for (let i = 0; i < samples.length; i += step) {
    const p = samples[i];
    for (const side of [-1, 1]) {
      const roll = rand();
      const offset = half + runoff + 8 + rand() * 26;
      if (roll < (def.treeDensity ?? 0.5)) {
        props.push({
          kind: rand() < 0.7 ? "tree" : "treeBrown",
          x: p.x + p.nx * offset * side,
          y: p.y + p.ny * offset * side,
          r: 4,
          art: 8.5,
          scale: 0.75 + rand() * 0.45,
          solid: false,
        });
      } else if (roll < (def.treeDensity ?? 0.5) + 0.18) {
        props.push({
          kind: "fence",
          x: p.x + p.nx * (half + runoff + 2.4) * side,
          y: p.y + p.ny * (half + runoff + 2.4) * side,
          angle: Math.atan2(p.ty, p.tx),
          r: 4,
          art: 8,
          scale: 1,
          solid: false,
        });
      }
    }
  }
  // Hazards on the run-off: clip one and you lose time and take damage.
  for (let i = 0; i < samples.length; i += 1) {
    const p = samples[i];
    if (p.curv < 0.006) continue;
    if (rand() > (def.hazardDensity ?? 0.12)) continue;
    const side = rand() < 0.5 ? -1 : 1;
    // Well clear of the kerb: hazards punish a real excursion, not a wide line.
    const offset = half + runoff * 0.45 + rand() * (runoff * 0.5);
    const barrel = rand() < 0.5;
    props.push({
      kind: barrel ? "barrel" : "barricade",
      x: p.x + p.nx * offset * side,
      y: p.y + p.ny * offset * side,
      angle: Math.atan2(p.ty, p.tx),
      r: barrel ? 1.2 : 1.6,
      art: barrel ? 2.6 : 4.2,
      scale: 1,
      solid: true,
      damage: barrel ? 12 : 18,
    });
  }
  // Oil slicks sit on the racing surface: no damage, but grip drops away.
  const slicks = def.oilCount ?? 0;
  for (let k = 0; k < slicks; k += 1) {
    const p = samples[Math.floor(rand() * samples.length)];
    const lateral = (rand() * 2 - 1) * (half - 5);
    props.push({
      kind: "oil",
      x: p.x + p.nx * lateral,
      y: p.y + p.ny * lateral,
      r: 6,
      art: 13,
      scale: 1.1,
      solid: false,
      grip: 0.3,
    });
  }
  return props;
}

export const TRACKS = [
  {
    id: "seawall",
    name: "西濱海線",
    subtitle: "寬彎高速 · 逆風直線",
    laps: 3,
    timeLimit: 210000,
    width: 26,
    runoff: 13,
    radiusX: 300,
    radiusY: 205,
    harmonics: [
      { k: 2, amp: 0.14, phase: 0.4 },
      { k: 3, amp: 0.07, phase: 1.9 },
    ],
    control: 36,
    seed: 1337,
    treeDensity: 0.34,
    hazardDensity: 0.08,
    oilCount: 0,
    aiSkill: 0.9,
    theme: { terrain: "sand", grass: "#2fa06a", tint: "#3ea",  sky: "#0e2a3a" },
    parTime: 141000,
  },
  {
    id: "hairpin",
    name: "山城髮夾",
    subtitle: "連續髮夾 · 煞車功課",
    laps: 3,
    timeLimit: 230000,
    width: 22,
    runoff: 9,
    radiusX: 235,
    radiusY: 235,
    harmonics: [
      { k: 3, amp: 0.26, phase: 0.2 },
      { k: 5, amp: 0.12, phase: 2.4 },
      { k: 7, amp: 0.05, phase: 1.1 },
    ],
    control: 44,
    seed: 24601,
    treeDensity: 0.62,
    hazardDensity: 0.16,
    oilCount: 3,
    aiSkill: 0.95,
    theme: { terrain: "grass", grass: "#2b8f5d", tint: "#8fd", sky: "#12212f" },
    parTime: 153000,
  },
  {
    id: "harbour",
    name: "夜港短道",
    subtitle: "短圈技術 · 油漬陷阱",
    laps: 4,
    timeLimit: 200000,
    width: 20,
    runoff: 8,
    radiusX: 190,
    radiusY: 150,
    harmonics: [
      { k: 2, amp: 0.2, phase: 1.2 },
      { k: 4, amp: 0.14, phase: 0.3 },
      { k: 6, amp: 0.06, phase: 2.7 },
    ],
    control: 40,
    seed: 90210,
    treeDensity: 0.28,
    hazardDensity: 0.2,
    oilCount: 5,
    aiSkill: 1,
    theme: { terrain: "grass", grass: "#24704d", tint: "#fd8", sky: "#0a1626" },
    parTime: 144000,
  },
  {
    id: "island",
    name: "全島大環",
    subtitle: "長距離 · 續航與耐撞",
    laps: 2,
    timeLimit: 260000,
    width: 24,
    runoff: 11,
    radiusX: 420,
    radiusY: 300,
    harmonics: [
      { k: 2, amp: 0.12, phase: 2.2 },
      { k: 3, amp: 0.13, phase: 0.9 },
      { k: 5, amp: 0.08, phase: 1.6 },
      { k: 8, amp: 0.03, phase: 0.1 },
    ],
    control: 56,
    seed: 5150,
    treeDensity: 0.5,
    hazardDensity: 0.11,
    oilCount: 2,
    aiSkill: 1.02,
    theme: { terrain: "sand", grass: "#2d9a63", tint: "#9cf", sky: "#0d2433" },
    parTime: 126000,
  },
];

export function trackDef(id) {
  return TRACKS.find((t) => t.id === id) || TRACKS[0];
}

export function buildTrack(def) {
  const control =
    def.points ??
    polarLoop({
      radiusX: def.radiusX,
      radiusY: def.radiusY,
      harmonics: def.harmonics,
      count: def.control,
    });
  const dense = smoothClosed(control, 12);
  const { samples, length, spacing } = resampleClosed(dense, 5);
  annotate(samples, length);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of samples) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const track = {
    id: def.id,
    name: def.name,
    subtitle: def.subtitle,
    laps: def.laps,
    timeLimit: def.timeLimit,
    parTime: def.parTime,
    width: def.width,
    runoff: def.runoff,
    kerb: 2.6,
    aiSkill: def.aiSkill ?? 1,
    theme: def.theme,
    samples,
    length,
    spacing,
    bounds: { minX, minY, maxX, maxY },
  };
  track.props = placeProps(track, def);
  return track;
}

/**
 * Nearest point on the centreline. `hint` restricts the scan to a window around
 * the previous match, which keeps the per-frame cost flat regardless of length.
 */
export function nearestOnTrack(track, x, y, hint = null) {
  const s = track.samples;
  const n = s.length;
  let best = -1;
  let bestD2 = Infinity;
  if (hint === null) {
    for (let i = 0; i < n; i += 1) {
      const d2 = (s[i].x - x) ** 2 + (s[i].y - y) ** 2;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = i;
      }
    }
  } else {
    const window = Math.max(12, Math.round(45 / track.spacing));
    for (let k = -window; k <= window; k += 1) {
      const i = (((hint + k) % n) + n) % n;
      const d2 = (s[i].x - x) ** 2 + (s[i].y - y) ** 2;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = i;
      }
    }
  }
  const p = s[best];
  const dx = x - p.x;
  const dy = y - p.y;
  const along = dx * p.tx + dy * p.ty;
  const lateral = dx * p.nx + dy * p.ny;
  let sPos = p.s + along;
  if (sPos < 0) sPos += track.length;
  if (sPos >= track.length) sPos -= track.length;
  return { index: best, dist: Math.abs(lateral), lateral, s: sPos, point: p };
}

export function sampleAt(track, s) {
  const n = track.samples.length;
  let v = s % track.length;
  if (v < 0) v += track.length;
  const i = Math.floor(v / track.spacing) % n;
  return track.samples[i];
}

/** Highest curvature in the next `distance` metres — how hard the corner bites. */
export function curvatureAhead(track, s, distance) {
  const n = track.samples.length;
  const steps = Math.max(1, Math.round(distance / track.spacing));
  const start = Math.floor((((s % track.length) + track.length) % track.length) / track.spacing);
  let max = 0;
  for (let k = 0; k <= steps; k += 1) {
    const c = track.samples[(start + k) % n].curv;
    if (c > max) max = c;
  }
  return max;
}

export function surfaceAt(track, x, y, hint = null) {
  const near = nearestOnTrack(track, x, y, hint);
  const half = track.width / 2;
  let kind = SURFACE.ROAD;
  if (near.dist > half + track.runoff) kind = SURFACE.WALL;
  else if (near.dist > half) kind = track.theme.terrain === "sand" ? SURFACE.SAND : SURFACE.GRASS;
  else if (near.dist > half - track.kerb) kind = SURFACE.KERB;
  return { ...near, kind, limit: half + track.runoff };
}

/** Grid start slots: two-by-two, staggered behind the line. */
export function startSlot(track, index) {
  const back = 14 + Math.floor(index / 2) * 11;
  const s = track.length - back;
  const p = sampleAt(track, s);
  const lateral = index % 2 === 0 ? -track.width * 0.2 : track.width * 0.2;
  return {
    x: p.x + p.nx * lateral,
    y: p.y + p.ny * lateral,
    angle: Math.atan2(p.ty, p.tx),
  };
}

/**
 * Arc-length delta between two positions, wrapped to the shorter way round.
 * Jumps beyond a quarter lap are rejected so a glitch cannot bank a lap.
 */
export function progressDelta(track, prevS, nextS) {
  let d = nextS - prevS;
  const L = track.length;
  if (d > L / 2) d -= L;
  if (d < -L / 2) d += L;
  if (Math.abs(d) > L * 0.25) return 0;
  return d;
}

export function lapFromDistance(track, distance) {
  return Math.floor(distance / track.length) + 1;
}

export function lapFraction(track, distance) {
  const v = distance % track.length;
  return clamp(v / track.length, 0, 1);
}
