export type FailureKind =
  | "auth"
  | "forbidden"
  | "network"
  | "timeout"
  | "server"
  | "invalid"
  | "request";
export const failureKind = (status: number): FailureKind =>
  status === 401
    ? "auth"
    : status === 403
    ? "forbidden"
    : status >= 500
    ? "server"
    : status === 0
    ? "network"
    : "request";
export class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public kind = failureKind(status)
  ) {
    super(message);
    if (kind === "timeout") this.name = "AbortError";
  }
}
export const isAuthenticationError = (error: unknown) =>
  error instanceof RequestError && error.kind === "auth";
export interface ConnectionState {
  phase: "checking" | "ready" | FailureKind;
  message: string;
  episode: number;
}
let state: ConnectionState = { phase: "checking", message: "", episode: 0 };
let managed = 0;
let generation = 0;
let pending: Promise<ConnectionState> | undefined;
let lastCheck = 0;
let writes = 0;
const listeners = new Set<() => void>();
const publish = (phase: ConnectionState["phase"], message = "") => {
  state = {
    phase,
    message,
    episode:
      phase === "auth" && state.phase !== "auth"
        ? state.episode + 1
        : state.episode,
  };
  listeners.forEach((listener) => listener());
};
export const connection = {
  getSnapshot: () => state,
  active: () => managed > 0,
  writes: () => writes,
  blocked: () => managed > 0 && state.phase === "auth",
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  start() {
    managed++;
    return () => {
      managed--;
    };
  },
};

/** All application requests stay on our origin; redirects belong to Access. */
export async function requestData<T>(
  url: string,
  options: RequestInit = {},
  config: { timeout?: number; image?: boolean; probe?: boolean } = {}
): Promise<T> {
  if (!config.probe && connection.blocked())
    throw new RequestError(
      "로그인을 다시 확인해야 합니다. 기기 기록은 보존됩니다.",
      401
    );
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    config.timeout || 10000
  );
  const requestGeneration = generation;
  const writing = !["GET", "HEAD"].includes(options.method || "GET");
  if (writing) writes++;
  try {
    const headers = new Headers(options.headers);
    headers.set("X-Requested-With", "XMLHttpRequest");
    if (options.body instanceof FormData) headers.delete("Content-Type");
    else if (!headers.has("Content-Type"))
      headers.set("Content-Type", "application/json");
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
      cache: "no-store",
      credentials: "same-origin",
      redirect: "manual",
    });
    if (
      response.type === "opaqueredirect" ||
      response.redirected ||
      response.status === 401
    )
      throw new RequestError(
        "로그인을 다시 확인해야 합니다. 기기 기록은 보존됩니다.",
        401
      );
    if (response.status === 403)
      throw new RequestError(
        "접근 권한이 없습니다. 허용된 계정인지 확인해 주세요.",
        403
      );
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new RequestError(
        String(
          payload?.message ||
            (response.status >= 500
              ? "서버가 응답하지 못했습니다. 잠시 후 다시 시도해 주세요."
              : "요청을 처리하지 못했습니다.")
        ),
        response.status
      );
    }
    if (response.status === 204) return undefined as unknown as T;
    if (
      !response.headers
        .get("content-type")
        ?.includes(config.image ? "image/jpeg" : "application/json")
    )
      throw new RequestError(
        "서버 응답을 확인하지 못했습니다. 다시 시도해 주세요.",
        response.status,
        "invalid"
      );
    return (await (config.image ? response.blob() : response.json())) as T;
  } catch (error) {
    const failure =
      error instanceof RequestError
        ? error
        : new RequestError(
            controller.signal.aborted
              ? "응답 시간이 초과되었습니다. 다시 시도해 주세요."
              : error instanceof SyntaxError
              ? "서버 응답을 확인하지 못했습니다. 다시 시도해 주세요."
              : "서버에 연결하지 못했습니다. 연결 상태를 확인하고 다시 시도하세요.",
            0,
            controller.signal.aborted
              ? "timeout"
              : error instanceof SyntaxError
              ? "invalid"
              : "network"
          );
    if (requestGeneration === generation && failure.kind === "auth") {
      generation++;
      publish("auth", failure.message);
    }
    throw failure;
  } finally {
    window.clearTimeout(timeout);
    if (writing) writes--;
  }
}

/** An explicit successful probe, never a late data response, ends an auth episode. */
export function checkConnection(force = false): Promise<ConnectionState> {
  if (pending) return pending;
  if (!force && lastCheck && Date.now() - lastCheck < 30000)
    return Promise.resolve(state);
  lastCheck = Date.now();
  const started = generation;
  pending = (async () => {
    if (navigator.onLine === false) {
      if (started === generation)
        publish(
          "network",
          "인터넷 연결이 끊겼습니다. 저장된 기록은 계속 사용할 수 있습니다."
        );
      return state;
    }
    try {
      const result = await requestData<{ ok: boolean }>(
        "/api/connection",
        {},
        { probe: true }
      );
      if (result?.ok !== true)
        throw new RequestError(
          "서버 연결 확인 응답이 올바르지 않습니다.",
          200,
          "invalid"
        );
      if (started === generation) {
        generation++;
        publish("ready");
      }
    } catch (error) {
      if (started === generation && error instanceof RequestError)
        publish(error.kind, error.message);
    }
    return state;
  })().finally(() => {
    pending = undefined;
  });
  return pending;
}
