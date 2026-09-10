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
      window.history.replaceState(null, "", withoutReauth(window.location.href));
  } catch {
    publish("error");
  }
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
