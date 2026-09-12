import { prunePrecaches } from "./pwaCache";
const scope = "https://example.test/";
function setup(builds) {
  const names = [
    "nmp-app-precache-v2-A",
    "nmp-app-precache-v2-B",
    `workbox-precache-v2-${scope}`,
    "user-data",
  ];
  return {
    clients: {
      matchAll: jest.fn(async () => builds.map((build) => ({ build }))),
    },
    caches: { delete: jest.fn(async () => true) },
    currentCache: names[1],
    candidates: names,
    buildId: "B",
    scope,
    getBuild: async (client) => client.build,
  };
}
it.each([
  ["A", "B"],
  ["", "B"],
])("retains assets for old or unknown tabs: %s %s", async (a, b) => {
  const options = setup([a, b]);
  await prunePrecaches(options);
  expect(options.caches.delete).not.toHaveBeenCalled();
});
it("only deletes previous app precaches after every client uses this build", async () => {
  const options = setup(["B", "B"]);
  await prunePrecaches(options);
  expect(options.caches.delete.mock.calls).toEqual([
    ["nmp-app-precache-v2-A"],
    [`workbox-precache-v2-${scope}`],
  ]);
});
it("never includes a future installing release in cleanup", async () => {
  const options = setup(["B"]);
  options.caches.keys = jest.fn(async () => [
    ...options.candidates,
    "nmp-app-precache-v2-C",
  ]);
  await prunePrecaches(options);
  expect(options.caches.delete).not.toHaveBeenCalledWith(
    "nmp-app-precache-v2-C"
  );
});

const response = (html, type = "text/html") => ({
  ok: true,
  redirected: false,
  headers: { get: () => type },
  clone: () => ({ text: async () => html }),
});
it("rejects mixed-release HTML during deployment", async () => {
  const { validatePrecacheResponse } = await import("./pwaCache");
  const request = { url: "https://example.test/index.html" };
  const valid = response('<meta name="app-build" content="B"/>');
  expect(await validatePrecacheResponse(request, valid, "B")).toBe(valid);
  await expect(
    validatePrecacheResponse(
      request,
      response('<meta name="app-build" content="A"/>'),
      "B"
    )
  ).rejects.toThrow("Mismatched offline build");
});
it("rejects login HTML and redirects in place of JavaScript", async () => {
  const { validatePrecacheResponse } = await import("./pwaCache");
  const request = { url: "https://example.test/static/main.js" };
  await expect(
    validatePrecacheResponse(request, response("login"), "B")
  ).rejects.toThrow("Invalid offline asset");
  await expect(
    validatePrecacheResponse(
      request,
      { ...response("", "application/javascript"), redirected: true },
      "B"
    )
  ).rejects.toThrow("Invalid offline asset");
});
