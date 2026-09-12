/* eslint-disable no-restricted-globals */
import { clientsClaim, cacheNames, setCacheNameDetails } from "workbox-core";
import {
  addPlugins,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

import {
  ownedPrecache,
  prunePrecaches,
  validatePrecacheResponse,
} from "./offline/pwaCache";
const buildId = process.env.REACT_APP_BUILD_ID;
setCacheNameDetails({ prefix: "nmp-app", suffix: buildId });
const clientBuild = (client) =>
  new Promise((resolve) => {
    const channel = new MessageChannel();
    const finish = (value) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(value);
    };
    const timer = setTimeout(() => finish(""), 1500);
    channel.port1.onmessage = (event) => finish(event.data?.buildId || "");
    try {
      client.postMessage({ type: "GET_CLIENT_BUILD" }, [channel.port2]);
    } catch {
      finish("");
    }
  });
let cleanup;
let previousCaches = [];
const previousCachesReady = caches.keys();
const prune = () =>
  cleanup ||
  (cleanup = prunePrecaches({
    clients: self.clients,
    caches,
    currentCache: cacheNames.precache,
    buildId,
    scope: self.registration.scope,
    getBuild: clientBuild,
    candidates: previousCaches,
  })
    .catch(() => undefined)
    .finally(() => {
      cleanup = undefined;
    }));
self.addEventListener("message", (event) => {
  if (event.data?.type === "GET_BUILD") {
    event.ports[0]?.postMessage({ buildId });
    event.waitUntil(prune());
  }
});

// A redirected Access login page must never replace a working offline asset.
addPlugins([
  {
    fetchDidSucceed: ({ request, response }) =>
      validatePrecacheResponse(request, response, buildId),
  },
]);
precacheAndRoute([
  ...self.__WB_MANIFEST,
  { url: "/attendance-photo-worker.js", revision: "fa65e8e6cdcd7dce" },
]);

registerRoute(
  new NavigationRoute(createHandlerBoundToURL("/index.html"), {
    allowlist: [/^\/(?:lesson-notes|lesson-plans|attendance)?(?:\?.*)?$/],
    denylist: [/[?&]reauth=1(?:&|$)/],
  })
);
// Old tabs may request an old hashed chunk after the new worker takes control.
registerRoute(
  ({ url, request }) =>
    request.method === "GET" &&
    url.origin === self.location.origin &&
    url.pathname.startsWith("/static/"),
  async ({ request }) => {
    for (const name of await caches.keys()) {
      if (!ownedPrecache(name, self.registration.scope)) continue;
      const response = await (
        await caches.open(name)
      ).match(request, { ignoreSearch: true });
      if (response) return response;
    }
    return fetch(request);
  }
);
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      previousCaches = (await previousCachesReady).filter(
        (name) => name !== cacheNames.precache
      );
      await prune();
    })()
  );
});
clientsClaim();
