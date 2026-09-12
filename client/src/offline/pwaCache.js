// Each release owns a separate precache. Unknown/legacy tabs keep old caches alive.
export function ownedPrecache(name, scope) {
  return (
    name.startsWith("nmp-app-precache-") ||
    name === `workbox-precache-v2-${scope}`
  );
}
export async function prunePrecaches({
  clients,
  caches,
  currentCache,
  buildId,
  scope,
  getBuild,
  candidates,
}) {
  const windows = await clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  const builds = await Promise.all(windows.map(getBuild));
  if (builds.some((value) => value !== buildId)) return;
  const names = candidates;
  await Promise.all(
    names
      .filter((name) => name !== currentCache && ownedPrecache(name, scope))
      .map((name) => caches.delete(name))
  );
}

export async function validatePrecacheResponse(request, response, buildId) {
  const pathname = new URL(request.url).pathname;
  const type = response.headers.get("content-type") || "";
  const expected = pathname.endsWith(".js")
    ? /(?:java|ecma)script/
    : pathname.endsWith(".css")
    ? /text\/css/
    : pathname.endsWith(".html")
    ? /text\/html/
    : null;
  if (!response.ok || response.redirected || (expected && !expected.test(type)))
    throw new Error("Invalid offline asset");
  if (pathname === "/index.html") {
    const html = await response.clone().text();
    const match = html.match(
      /<meta\s+name=["']?app-build["']?\s+content=["']?([a-zA-Z0-9-]+)["']?\s*\/?>/i
    );
    if (match?.[1] !== buildId) throw new Error("Mismatched offline build");
  }
  return response;
}
