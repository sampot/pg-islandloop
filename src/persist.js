const PREFIX = "pg-islandloop:";

/**
 * Persistence goes through `PG.kv` when the shell injected it, falls back to the
 * default `/api/kv` routes, and finally to memory so a bare `index.html` still
 * plays. Nothing here touches localStorage: KV is the authority.
 */
export function createStore({ pg = globalThis.PG, fetcher = globalThis.fetch } = {}) {
  const memory = new Map();
  const key = (name) => PREFIX + name;

  async function readRaw(name) {
    if (pg?.kv?.get) return pg.kv.get(key(name));
    if (fetcher) {
      const res = await fetcher(`/api/kv/${encodeURIComponent(key(name))}`);
      if (!res || !res.ok) return null;
      const text = await res.text();
      return text || null;
    }
    return memory.has(key(name)) ? memory.get(key(name)) : null;
  }

  async function writeRaw(name, value) {
    if (pg?.kv?.put) {
      await pg.kv.put(key(name), value);
      return;
    }
    if (fetcher) {
      const res = await fetcher(`/api/kv/${encodeURIComponent(key(name))}`, { method: "PUT", body: value });
      if (!res || !res.ok) throw new Error("kv_put_failed");
      return;
    }
    memory.set(key(name), value);
  }

  return {
    async get(name, fallback = null) {
      try {
        const raw = await readRaw(name);
        if (raw) return JSON.parse(raw);
      } catch {
        /* fall through to the session copy below */
      }
      const cached = memory.get(key(name));
      return cached === undefined ? fallback : safeParse(cached, fallback);
    },
    async set(name, value) {
      const body = JSON.stringify(value);
      memory.set(key(name), body);
      try {
        await writeRaw(name, body);
        return { ok: true };
      } catch (error) {
        return { ok: false, error: describe(error) };
      }
    },
  };
}

function safeParse(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function describe(error) {
  if (!error) return "unknown";
  if (error.code === "functions_no_leader") return "後端還沒就緒";
  if (error.code === "functions_unavailable") return "後端暫時無法使用";
  return "雲端存檔失敗";
}
