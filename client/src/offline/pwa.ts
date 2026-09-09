export type PwaState =
  | "preparing"
  | "ready"
  | "update"
  | "error"
  | "unsupported";
let state: PwaState = "preparing";
const listeners = new Set<() => void>();
export const pwaState = () => state;
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
export async function registerPwa() {
  if (
    process.env.NODE_ENV !== "production" ||
    !("serviceWorker" in navigator)
  ) {
    publish("unsupported");
    return;
  }
  try {
    const registration = await navigator.serviceWorker.register(
      "/service-worker.js",
      { updateViaCache: "none" }
    );
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed")
          publish(registration.waiting ? "update" : "ready");
        if (worker.state === "redundant" && !registration.active)
          publish("error");
      });
    });
    await navigator.serviceWorker.ready;
    publish(registration.waiting ? "update" : "ready");
    if (new URLSearchParams(window.location.search).has("reauth"))
      window.history.replaceState(null, "", "/lesson-notes");
  } catch {
    publish("error");
  }
}
