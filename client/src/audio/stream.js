/* eslint-disable no-restricted-globals */
export async function audioStream({request, event}) {
  const url = new URL(request.url); url.searchParams.delete("nmpAudio");
  const fallback = () => fetch(new Request(url.href, request));
  const client = await self.clients.get(event.clientId);
  if (!client) return fallback();
  const prefix = await new Promise(resolve => {
    const channel = new MessageChannel();
    const finish = value => { clearTimeout(timer); channel.port1.close(); resolve(value); };
    const timer = setTimeout(() => finish(null), 50);
    channel.port1.onmessage = e => finish(e.data);
    client.postMessage({type:"AUDIO_PREFIX", url:url.pathname}, [channel.port2]);
  });
  if (!prefix) return fallback();
  const range = request.headers.get("range");
  const match = range && /^bytes=(\d+)-(\d*)$/.exec(range);
  if (range && !match) return fallback();
  const start = match ? +match[1] : 0;
  const end = match && match[2] ? Math.min(+match[2], prefix.total - 1) : prefix.total - 1;
  if (start >= prefix.bytes.length || end < start || request.headers.has("if-range")) return fallback();
  const split = Math.min(prefix.bytes.length, end + 1);
  const abort = new AbortController();
  let reader;
  const body = new ReadableStream({
    start(output) { output.enqueue(prefix.bytes.slice(start, split)); },
    async pull(output) {
      try {
        if (split > end) { output.close(); return; }
        if (!reader) {
          const response = await fetch(url.href, {headers:{Range:"bytes="+split+"-"+end, "If-Range":prefix.modified}, credentials:"same-origin", redirect:"manual", cache:"no-store", signal:abort.signal});
          if (response.status !== 206 || response.headers.get("last-modified") !== prefix.modified || response.headers.get("content-range") !== "bytes "+split+"-"+end+"/"+prefix.total) throw new Error("Audio changed");
          reader = response.body.getReader();
        }
        const part = await reader.read();
        if (part.done) output.close(); else output.enqueue(part.value);
      } catch(error) { output.error(error); }
    },
    cancel() { abort.abort(); return reader?.cancel(); }
  });
  const headers = {"Content-Type":"audio/mpeg", "Content-Length":String(end-start+1), "Accept-Ranges":"bytes", "Cache-Control":"no-store"};
  if (range) headers["Content-Range"] = "bytes "+start+"-"+end+"/"+prefix.total;
  return new Response(body, {status:range ? 206 : 200, headers});
}
