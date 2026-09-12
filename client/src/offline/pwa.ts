export type PwaState =
  | "preparing"
  | "ready"
  | "update"
  | "error"
  | "unsupported";
export const appBuildId = process.env.REACT_APP_BUILD_ID || "development";
let state: PwaState = "preparing";
let latestBuild = "";
let registration: ServiceWorkerRegistration | undefined;
let start: Promise<boolean> | undefined;
let checking: Promise<void> | undefined;
let lastCheck = 0;
const listeners = new Set<() => void>();
const observed = new WeakSet<ServiceWorkerRegistration>();
export const pwaState = () => state;
export const availableBuildId = () => latestBuild;
export const subscribePwa = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const publish = (next: PwaState) => {
  state = next;
  listeners.forEach((listener) => listener());
};
const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
export function workerBuild(worker: ServiceWorker | null): Promise<string> {
  if (!worker) return Promise.resolve("");
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const finish = (value: string) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(value);
    };
    const timer = setTimeout(() => finish(""), 1000);
    channel.port1.onmessage = (event) =>
      finish(typeof event.data?.buildId === "string" ? event.data.buildId : "");
    try {
      worker.postMessage({ type: "GET_BUILD" }, [channel.port2]);
    } catch {
      finish("");
    }
  });
}
async function inspectController() {
  const controller = navigator.serviceWorker.controller;
  const build = await workerBuild(controller);
  if (controller !== navigator.serviceWorker.controller) return;
  if (build) latestBuild = build;
  publish(
    build && build !== appBuildId
      ? "update"
      : build || registration?.active || controller
      ? "ready"
      : "preparing"
  );
}
export function checkPwaUpdate(force = false): Promise<void> {
  if (checking) return checking;
  if (
    !("serviceWorker" in navigator) ||
    (!force && Date.now() - lastCheck < 30000)
  )
    return Promise.resolve();
  lastCheck = Date.now();
  const cycle = (async () => {
    try {
      if (!registration)
        registration = await navigator.serviceWorker.register(
          "/service-worker.js",
          { updateViaCache: "none" }
        );
      const current = registration;
      if (!observed.has(current)) {
        observed.add(current);
        current.addEventListener("updatefound", () => {
          const worker = current.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "activated") void inspectController();
            if (worker.state === "redundant" && !current.active)
              publish("error");
          });
        });
      }
      await current.update();
      const worker = registration!.installing || registration!.waiting;
      if (worker && !["activated", "redundant"].includes(worker.state)) {
        await new Promise<void>((resolve) => {
          const finish = () => {
            clearTimeout(timer);
            worker.removeEventListener("statechange", changed);
            resolve();
          };
          const changed = () => {
            if (["activated", "redundant"].includes(worker.state)) finish();
          };
          const timer = setTimeout(finish, 5000);
          worker.addEventListener("statechange", changed);
          changed();
        });
      }
      if (
        registration!.active &&
        navigator.serviceWorker.controller !== registration!.active
      ) {
        await new Promise<void>((resolve) => {
          const finish = () => {
            clearTimeout(timer);
            navigator.serviceWorker.removeEventListener(
              "controllerchange",
              finish
            );
            resolve();
          };
          const timer = setTimeout(finish, 1000);
          navigator.serviceWorker.addEventListener("controllerchange", finish);
        });
      }
      await inspectController();
    } catch {
      if (navigator.serviceWorker.controller) await inspectController();
      else publish("error");
    }
  })();
  checking = Promise.race([cycle, delay(5000)]).finally(() => {
    checking = undefined;
  });
  return checking;
}
export function reloadForBuild(build: string): boolean {
  if (!build || build === appBuildId) return false;
  try {
    const key = "nmp.update-attempt";
    if (sessionStorage.getItem(key) === build) return false;
    sessionStorage.setItem(key, build);
  } catch {
    return false;
  } // No durable loop guard: keep the usable editor.
  window.location.reload();
  return true;
}
export async function applyPwaUpdate(
  canReload: () => boolean = () => true
): Promise<boolean> {
  if (!canReload()) return false;
  await inspectController();
  return canReload() && reloadForBuild(latestBuild);
}
async function initialize(): Promise<boolean> {
  if (
    process.env.NODE_ENV !== "production" ||
    !("serviceWorker" in navigator)
  ) {
    publish("unsupported");
    return false;
  }
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "GET_CLIENT_BUILD")
      event.ports[0]?.postMessage({ buildId: appBuildId });
  });
  // Activation never reloads a mounted editor or another tab.
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    void inspectController();
  });
  void inspectController();
  await checkPwaUpdate(true);
  if (state === "update" && reloadForBuild(latestBuild)) return true;
  if (latestBuild === appBuildId) {
    try {
      sessionStorage.removeItem("nmp.update-attempt");
    } catch {
      /* Storage unavailable. */
    }
  }
  const refresh = () => {
    if (document.visibilityState !== "hidden") void checkPwaUpdate();
  };
  document.addEventListener("visibilitychange", refresh);
  window.addEventListener("focus", refresh);
  window.addEventListener("online", refresh);
  setInterval(refresh, 60000);
  if (new URLSearchParams(window.location.search).has("reauth"))
    window.history.replaceState(null, "", withoutReauth(window.location.href));
  return false;
}
export function registerPwa(): Promise<boolean> {
  return start || (start = initialize());
}
export function withoutReauth(href: string) {
  const url = new URL(href);
  url.searchParams.delete("reauth");
  return `${url.pathname}${url.search}${url.hash}`;
}
export function reauthUrl(href = window.location.href) {
  const url = new URL(href);
  url.searchParams.set("reauth", "1");
  return `${url.pathname}${url.search}${url.hash}`;
}
