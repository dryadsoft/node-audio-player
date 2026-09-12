import { workerBuild } from "./pwa";

class Channel {
  port1: any = { onmessage: null, close: jest.fn() };
  port2: any = {
    postMessage: (data: unknown) => this.port1.onmessage?.({ data }),
  };
}
const originalChannel = global.MessageChannel;
const originalEnvironment = process.env.NODE_ENV;
afterEach(() => {
  jest.useRealTimers();
  global.MessageChannel = originalChannel;
  (process.env as any).NODE_ENV = originalEnvironment;
  jest.resetModules();
});
it("queries a worker build and bounds an unresponsive legacy worker", async () => {
  jest.useFakeTimers();
  global.MessageChannel = Channel as any;
  const responsive = {
    postMessage: (_: unknown, ports: any[]) =>
      ports[0].postMessage({ buildId: "release-B" }),
  };
  expect(await workerBuild(responsive as any)).toBe("release-B");
  const waiting = workerBuild({ postMessage: () => undefined } as any);
  jest.advanceTimersByTime(1000);
  expect(await waiting).toBe("");
});
it("opens the cached app after five seconds when registration hangs", async () => {
  jest.useFakeTimers();
  (process.env as any).NODE_ENV = "production";
  const sw = new EventTarget() as any;
  sw.register = jest.fn(() => new Promise(() => undefined));
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: sw,
  });
  const { registerPwa } = require("./pwa");
  const result = registerPwa();
  jest.advanceTimersByTime(5000);
  expect(await result).toBe(false);
  expect(registerPwa()).toBe(result);
  expect(sw.register).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(60000);
  await Promise.resolve();
  expect(sw.register).toHaveBeenCalledTimes(2);
  jest.clearAllTimers();
});
it("rechecks edit safety after awaiting the active worker", async () => {
  global.MessageChannel = Channel as any;
  const sw = new EventTarget() as any;
  let response: (() => void) | undefined;
  sw.controller = {
    postMessage: (_: unknown, ports: any[]) => {
      response = () => ports[0].postMessage({ buildId: "next" });
    },
  };
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: sw,
  });
  const { applyPwaUpdate } = require("./pwa");
  const guard = jest.fn().mockReturnValueOnce(true).mockReturnValue(false);
  const result = applyPwaUpdate(guard);
  response!();
  expect(await result).toBe(false);
  expect(guard).toHaveBeenCalledTimes(2);
});
