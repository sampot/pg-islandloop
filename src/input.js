import { clamp } from "./util.js";

export const DEAD_ZONE = 0.15;

export function createInputState() {
  return {
    steer: 0,
    throttle: 0,
    brake: 0,
    handbrake: false,
    nitro: false,
    autoThrottle: false,
  };
}

export const KEY_STEER_LEFT = ["ArrowLeft", "a", "A"];
export const KEY_STEER_RIGHT = ["ArrowRight", "d", "D"];
export const KEY_THROTTLE = ["ArrowUp", "w", "W"];
export const KEY_BRAKE = ["ArrowDown", "s", "S"];
export const KEY_HANDBRAKE = [" ", "Spacebar"];
export const KEY_NITRO = ["Shift", "n", "N"];

function has(list, key) {
  return list.includes(key);
}

/** Held keys to a control vector, so key handling stays testable. */
export function keysToInput(keys, base = createInputState()) {
  const held = keys instanceof Set ? keys : new Set(keys);
  let steer = 0;
  for (const k of held) {
    if (has(KEY_STEER_LEFT, k)) steer -= 1;
    if (has(KEY_STEER_RIGHT, k)) steer += 1;
  }
  let throttle = 0;
  let brake = 0;
  for (const k of held) {
    if (has(KEY_THROTTLE, k)) throttle = 1;
    if (has(KEY_BRAKE, k)) brake = 1;
  }
  let handbrake = false;
  let nitro = false;
  for (const k of held) {
    if (has(KEY_HANDBRAKE, k)) handbrake = true;
    if (has(KEY_NITRO, k)) nitro = true;
  }
  return { ...base, steer: clamp(steer, -1, 1), throttle, brake, handbrake, nitro };
}

/**
 * Floating analog stick maths: normalise to the unit circle and cut the dead
 * zone so a resting thumb reads as straight ahead.
 */
export function normalizeStick(dx, dy, radius, deadZone = DEAD_ZONE) {
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { x: 0, y: 0, force: 0 };
  const force = Math.min(1, len / radius);
  if (force < deadZone) return { x: 0, y: 0, force: 0 };
  const scaled = (force - deadZone) / (1 - deadZone);
  return { x: (dx / len) * scaled, y: (dy / len) * scaled, force: scaled };
}

/** Stick vector to pedals: push forward for throttle, pull back to brake. */
export function stickToDrive(vec, autoThrottle) {
  const steer = clamp(vec.x, -1, 1);
  if (autoThrottle) {
    return { steer, throttle: 1, brake: vec.y > 0.55 ? clamp((vec.y - 0.55) * 2.4, 0, 1) : 0 };
  }
  const forward = -vec.y;
  return {
    steer,
    throttle: forward > 0.1 ? clamp(forward * 1.3, 0, 1) : 0,
    brake: forward < -0.1 ? clamp(-forward * 1.3, 0, 1) : 0,
  };
}

export function mergeInputs(keyboard, touch) {
  return {
    steer: clamp(keyboard.steer + touch.steer, -1, 1),
    throttle: Math.max(keyboard.throttle, touch.throttle),
    brake: Math.max(keyboard.brake, touch.brake),
    handbrake: keyboard.handbrake || touch.handbrake,
    nitro: keyboard.nitro || touch.nitro,
  };
}

/**
 * Wires keyboard plus an on-screen stick and pedal cluster into one control
 * vector. Pointer Events only, and every release path zeroes the state so a
 * lifted or cancelled thumb can never stick the throttle down.
 */
export function attachControls({ zone, knob, pedals = {}, onPause, onRestart, doc = document }) {
  const keys = new Set();
  const touch = { steer: 0, throttle: 0, brake: 0, handbrake: false, nitro: false };
  let autoThrottle = false;
  let stickPointer = null;
  let origin = { x: 0, y: 0 };
  let radius = 52;
  let external = null;

  const state = { ...createInputState() };

  function recompute() {
    const kb = keysToInput(keys);
    Object.assign(state, mergeInputs(kb, touch));
    state.autoThrottle = autoThrottle;
  }

  function resetTouch() {
    touch.steer = 0;
    touch.throttle = 0;
    touch.brake = 0;
    touch.handbrake = false;
    touch.nitro = false;
    recompute();
  }

  function releaseStick(event) {
    if (stickPointer !== null && event && event.pointerId !== stickPointer) return;
    stickPointer = null;
    touch.steer = 0;
    if (!autoThrottle) {
      touch.throttle = 0;
      touch.brake = 0;
    }
    if (knob) knob.style.opacity = "0";
    recompute();
  }

  function moveStick(event) {
    if (stickPointer === null || event.pointerId !== stickPointer) return;
    const vec = normalizeStick(event.clientX - origin.x, event.clientY - origin.y, radius);
    applyStickVector(vec);
    if (knob) {
      knob.style.transform = `translate(${vec.x * radius}px, ${vec.y * radius}px)`;
    }
  }

  function applyStickVector(vec) {
    const drive = stickToDrive(vec, autoThrottle);
    touch.steer = drive.steer;
    if (autoThrottle) {
      touch.brake = drive.brake;
    } else {
      touch.throttle = drive.throttle;
      touch.brake = drive.brake;
    }
    recompute();
  }

  if (zone) {
    zone.addEventListener("pointerdown", (event) => {
      if (stickPointer !== null) return;
      stickPointer = event.pointerId;
      const rect = zone.getBoundingClientRect();
      radius = Math.max(38, Math.min(rect.width, rect.height) * 0.32);
      origin = { x: event.clientX, y: event.clientY };
      if (knob) {
        knob.style.opacity = "1";
        knob.style.left = `${event.clientX - rect.left}px`;
        knob.style.top = `${event.clientY - rect.top}px`;
        knob.style.transform = "translate(0px, 0px)";
      }
      zone.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    zone.addEventListener("pointermove", moveStick);
    zone.addEventListener("pointerup", releaseStick);
    zone.addEventListener("pointercancel", releaseStick);
    zone.addEventListener("lostpointercapture", releaseStick);
  }

  function bindPedal(el, apply) {
    if (!el) return;
    const down = (event) => {
      el.setPointerCapture?.(event.pointerId);
      el.dataset.active = "1";
      apply(true);
      recompute();
      event.preventDefault();
    };
    const up = () => {
      delete el.dataset.active;
      apply(false);
      recompute();
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("lostpointercapture", up);
  }

  bindPedal(pedals.gas, (on) => {
    touch.throttle = on ? 1 : 0;
  });
  bindPedal(pedals.brake, (on) => {
    touch.brake = on ? 1 : 0;
    touch.handbrake = on && Math.abs(touch.steer) > 0.35;
  });
  bindPedal(pedals.drift, (on) => {
    touch.handbrake = on;
  });
  bindPedal(pedals.nitro, (on) => {
    touch.nitro = on;
  });

  doc.addEventListener("keydown", (event) => {
    if (event.key === "p" || event.key === "P" || event.key === "Escape") {
      onPause?.();
      return;
    }
    if (event.key === "r" || event.key === "R") {
      onRestart?.();
      return;
    }
    const key = event.key === "Shift" ? "Shift" : event.key;
    if (!keys.has(key)) keys.add(key);
    if (
      has(KEY_STEER_LEFT, key) ||
      has(KEY_STEER_RIGHT, key) ||
      has(KEY_THROTTLE, key) ||
      has(KEY_BRAKE, key) ||
      has(KEY_HANDBRAKE, key)
    ) {
      event.preventDefault();
    }
    recompute();
  });
  doc.addEventListener("keyup", (event) => {
    keys.delete(event.key === "Shift" ? "Shift" : event.key);
    recompute();
  });
  const clearAll = () => {
    keys.clear();
    resetTouch();
    releaseStick(null);
  };
  doc.addEventListener("visibilitychange", () => {
    if (doc.hidden) clearAll();
  });
  globalThis.addEventListener?.("blur", clearAll);

  return {
    state,
    setAutoThrottle(on) {
      autoThrottle = Boolean(on);
      if (autoThrottle) touch.throttle = 1;
      else touch.throttle = 0;
      recompute();
    },
    get autoThrottle() {
      return autoThrottle;
    },
    clear: clearAll,
    /** Feed an external analog source (nipplejs) into the same control vector. */
    feedStick(vec) {
      external = vec;
      applyStickVector(vec);
    },
    get external() {
      return external;
    },
  };
}
