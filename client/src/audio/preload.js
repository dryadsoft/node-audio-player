import { checkConnection, connection } from "../api/connection";
const STEP = 65536;
const LIMIT = 16 * 1024 * 1024;
export const songUrl = path => "/songs/" + path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
export function seconds(bytes) {
  let offset = 0, duration = 0;
  if (bytes[0] === 73 && bytes[1] === 68 && bytes[2] === 51)
    offset = 10 + ((bytes[6] & 127) * 2097152 + (bytes[7] & 127) * 16384 + (bytes[8] & 127) * 128 + (bytes[9] & 127)) + ((bytes[5] & 16) ? 10 : 0);
  while (offset + 4 <= bytes.length) {
    const h = (bytes[offset] * 16777216 + bytes[offset+1] * 65536 + bytes[offset+2] * 256 + bytes[offset+3]) >>> 0;
    const v = (h >>> 19) & 3, layer = (h >>> 17) & 3, index = (h >>> 12) & 15, rate = (h >>> 10) & 3;
    if (h >>> 21 !== 2047 || v === 1 || layer !== 1 || !index || index === 15 || rate === 3) break;
    const bitrate = (v === 3 ? [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320] : [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160])[index];
    const sampleRate = [44100,48000,32000][rate] / (v === 3 ? 1 : v === 2 ? 2 : 4);
    const length = Math.floor((v === 3 ? 144 : 72) * bitrate * 1000 / sampleRate) + ((h >>> 9) & 1);
    if (offset + length > bytes.length) break;
    duration += (v === 3 ? 1152 : 576) / sampleRate;
    offset += length;
  }
  return duration;
}
export function createPreloader() {
  const cache = new Map(), failed = new Set();
  let paths = [], active = "", playing = false, controller, running = false, disposed = false, generation = 0;
  const allowed = () => !disposed && !connection.blocked() && !playing && !document.hidden && navigator.onLine !== false && !navigator.connection?.saveData;
  const cancel = () => { generation++; controller?.abort(); };
  const used = () => Array.from(cache.values()).reduce((sum, e) => sum + e.bytes.length, 0);
  async function pump() {
    if (running || !allowed()) return;
    running = true;
    const startedGeneration = generation;
    try {
      for (const phase of [1, 2]) {
        for (const url of paths) {
          while (allowed() && !failed.has(url)) {
            const entry = cache.get(url), start = entry?.bytes.length || 0;
            if (start >= (phase === 1 ? STEP : STEP * 8) || (entry && (start >= entry.total || seconds(entry.bytes) >= 10))) break;
            if (used() + STEP > LIMIT) return;
            const token = generation;
            controller = new AbortController();
            try {
              const headers = { Range: "bytes=" + start + "-" + (start + STEP - 1) };
              if (entry) headers["If-Range"] = entry.modified;
              const response = await fetch(url, { headers, signal: controller.signal, credentials: "same-origin", redirect: "manual", cache: "no-store" });
              const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get("content-range") || "");
              const modified = response.headers.get("last-modified");
              if (response.type === "opaqueredirect" || response.status === 401 || response.status === 403) { if (connection.active()) void checkConnection(true); throw new Error("Authentication required"); }
              if (response.status !== 206 || !range || +range[1] !== start || +range[2] - start + 1 > STEP || !modified || !response.headers.get("content-type")?.includes("audio/") || (entry && (modified !== entry.modified || +range[3] !== entry.total))) throw new Error("Invalid audio range");
              const reader = response.body.getReader(); const chunks = []; let size = 0;
              for (;;) {
                const {done, value} = await reader.read(); if (done) break;
                size += value.length;
                if (size > STEP) { await reader.cancel(); throw new Error("Oversized audio range"); }
                chunks.push(value);
              }
              if (size !== +range[2] - start + 1) throw new Error("Incomplete audio range");
              if (disposed || token !== generation) return;
              const bytes = new Uint8Array(start + size);
              if (entry) bytes.set(entry.bytes);
              let offset = start; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
              cache.set(url, {bytes, total:+range[3], modified});
            } catch (error) {
              if (token !== generation || disposed) return;
              failed.add(url); cache.delete(url); break;
            }
          }
        }
      }
    } finally { running = false; if (allowed() && generation !== startedGeneration) setTimeout(restart, 0); }
  }
  const restart = () => { void pump(); };
  const visibility = () => { cancel(); if (allowed()) setTimeout(restart, 0); };
  const message = event => {
    if (event.data?.type !== "AUDIO_PREFIX") return;
    const entry = cache.get(event.data.url);
    event.ports[0]?.postMessage(!connection.blocked() && entry && seconds(entry.bytes) > 0 ? entry : null);
  };
  return {
    start() {
      disposed = false; paths = [];
      document.addEventListener("visibilitychange", visibility);
      window.addEventListener("online", visibility);
      window.addEventListener("offline", visibility);
      navigator.serviceWorker?.addEventListener("message", message);
    },
    setTracks(tracks) {
      const next = tracks.filter(t => t.available && /\.mp3$/i.test(t.path)).map(t => songUrl(t.path));
      if (JSON.stringify(next) === JSON.stringify(paths)) return;
      cancel(); paths = next; failed.clear();
      for (const url of cache.keys()) if (!next.includes(url) && url !== active) cache.delete(url);
      setTimeout(restart, 0);
    },
    invalidate(path) { cache.delete(songUrl(path)); },
    select(path) {
      cancel(); active = songUrl(path); playing = true;
      for (const url of cache.keys()) if (!paths.includes(url) && url !== active) cache.delete(url);
      const entry = cache.get(active);
      return entry && seconds(entry.bytes) > 0 && navigator.serviceWorker?.controller ? active + "?nmpAudio=1" : null;
    },
    setPlaying(value) { playing = value; cancel(); if (!value) setTimeout(restart, 0); },
    dispose() {
      disposed = true; cancel(); cache.clear();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("online", visibility); window.removeEventListener("offline", visibility);
      navigator.serviceWorker?.removeEventListener("message", message);
    }
  };
}
