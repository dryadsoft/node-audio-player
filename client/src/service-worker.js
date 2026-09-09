/* eslint-disable no-restricted-globals */
import { clientsClaim } from "workbox-core";
import {
  addPlugins,
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

// A redirected Access login page must never replace a working offline asset.
addPlugins([
  {
    fetchDidSucceed: async ({ request, response }) => {
      const pathname = new URL(request.url).pathname;
      const type = response.headers.get("content-type") || "";
      const expected = pathname.endsWith(".js")
        ? /(?:java|ecma)script/
        : pathname.endsWith(".css")
        ? /text\/css/
        : pathname.endsWith(".html")
        ? /text\/html/
        : null;
      if (
        !response.ok ||
        response.redirected ||
        (expected && !expected.test(type))
      )
        throw new Error("Invalid offline asset");
      return response;
    },
  },
]);
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("/index.html"), {
    allowlist: [/^\/(?:lesson-notes|lesson-plans)?(?:\?.*)?$/],
    denylist: [/[?&]reauth=1(?:&|$)/],
  })
);
clientsClaim();
// No skipWaiting: open editors keep their current version until all tabs close.
