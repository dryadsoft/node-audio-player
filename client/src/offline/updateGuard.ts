import { useLayoutEffect, useRef } from "react";
const guards = new Set<() => string>();
export function addUpdateGuard(guard: () => string) {
  guards.add(guard);
  return () => {
    guards.delete(guard);
  };
}
export function updateBlockReason(): string {
  for (const guard of Array.from(guards)) {
    const reason = guard();
    if (reason) return reason;
  }
  return "";
}
export function usePwaUpdateGuard(reason: string) {
  const current = useRef(reason);
  current.current = reason;
  useLayoutEffect(() => addUpdateGuard(() => current.current), []);
}
