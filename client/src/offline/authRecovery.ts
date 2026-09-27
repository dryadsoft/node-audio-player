import { Dispatch, SetStateAction, useLayoutEffect, useState } from "react";
import { reauthUrl } from "./pwa";

const attemptKey = "nmp.auth.attempt";
const returnKey = "nmp.auth.return";
const values = new Map<string, unknown>();
let restored: Record<string, unknown> | undefined;
function returnValues() {
  if (restored) return restored;
  restored = {};
  try {
    const saved = JSON.parse(sessionStorage.getItem(returnKey) || "null");
    sessionStorage.removeItem(returnKey);
    if (
      saved?.path === window.location.pathname &&
      Date.now() - saved.at < 86400000
    )
      restored = saved.values || {};
  } catch {
    /* The screen still works without session storage. */
  }
  return restored!;
}
export function hasRecoveryValue(key: string) {
  return Object.prototype.hasOwnProperty.call(returnValues(), key);
}
export function useRecoveryState<T>(
  key: string,
  initial: T,
  valid?: (value: unknown) => value is T
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    const saved = returnValues()[key];
    const matches = valid
      ? valid(saved)
      : Array.isArray(initial)
      ? Array.isArray(saved) && saved.every((v) => typeof v === "string")
      : typeof saved === typeof initial &&
        (typeof saved !== "number" || Number.isFinite(saved));
    return matches ? (saved as T) : initial;
  });
  useLayoutEffect(() => {
    values.set(key, value);
    return () => {
      values.delete(key);
    };
  }, [key, value]);
  return [value, setValue];
}
export function clearAuthAttempt() {
  try {
    sessionStorage.removeItem(attemptKey);
  } catch {
    /* Manual recovery remains available. */
  }
}
export function hasAuthAttempt() {
  try {
    return !!sessionStorage.getItem(attemptKey);
  } catch {
    return true;
  }
}
export function beginAuthRecovery(
  manual: boolean,
  navigate = (url: string) => window.location.assign(url)
) {
  if (!manual && hasAuthAttempt()) return false;
  try {
    sessionStorage.setItem(
      returnKey,
      JSON.stringify({
        path: window.location.pathname,
        at: Date.now(),
        values: Object.fromEntries(values),
      })
    );
    sessionStorage.setItem(attemptKey, "1");
  } catch {
    if (!manual) return false;
  }
  navigate(reauthUrl());
  return true;
}

// All existing login buttons use the same navigation guard when mounted.
let handler: (() => void) | undefined;
export function registerReauthentication(next: () => void) {
  handler = next;
  return () => {
    if (handler === next) handler = undefined;
  };
}
export function requestReauthentication() {
  handler?.();
}
