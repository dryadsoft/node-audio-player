import { checkConnection, connection, requestData } from "./connection";
const json = (body: unknown, status = 200) =>
  ({
    status,
    ok: status >= 200 && status < 300,
    redirected: false,
    type: "basic",
    headers: new Headers({ "Content-Type": "application/json" }),
    json: async () => body,
  } as Response);
beforeEach(async () => {
  window.fetch = jest.fn().mockResolvedValue(json({ ok: true }));
  await checkConnection(true);
});
afterEach(() => {
  jest.useRealTimers();
});
it("uses the Access AJAX contract and preserves multipart boundaries", async () => {
  const body = new FormData();
  body.append("photo", new Blob(["image"]));
  await requestData("/api/attendance/pages/p/photo", { method: "PUT", body });
  const options = (fetch as jest.Mock).mock.calls.slice(-1)[0][1];
  expect(options).toMatchObject({
    credentials: "same-origin",
    redirect: "manual",
    cache: "no-store",
    body,
  });
  expect(options.headers.get("X-Requested-With")).toBe("XMLHttpRequest");
  expect(options.headers.get("Content-Type")).toBeNull();
});
it.each([
  [401, "auth"],
  [403, "forbidden"],
  [502, "server"],
  [409, "request"],
])("distinguishes HTTP %s as %s", async (status, kind) => {
  (fetch as jest.Mock).mockResolvedValue(
    json({ message: "failure" }, Number(status))
  );
  await expect(requestData("/api/playlist")).rejects.toMatchObject({
    status,
    kind,
  });
});
it("recognizes opaque redirects without reading a body or following login", async () => {
  const read = jest.fn();
  (fetch as jest.Mock).mockResolvedValue({
    type: "opaqueredirect",
    status: 0,
    ok: false,
    json: read,
  });
  await expect(requestData("/api/playlist")).rejects.toMatchObject({
    status: 401,
    kind: "auth",
  });
  expect(read).not.toHaveBeenCalled();
});
it("stops repeated requests and writes until an explicit probe succeeds", async () => {
  const stop = connection.start();
  try {
    (fetch as jest.Mock).mockResolvedValue(json({}, 401));
    await expect(requestData("/api/playlists")).rejects.toMatchObject({
      kind: "auth",
    });
    const count = (fetch as jest.Mock).mock.calls.length;
    await expect(
      requestData("/api/playlists", { method: "POST", body: "{}" })
    ).rejects.toMatchObject({ kind: "auth" });
    expect(fetch).toHaveBeenCalledTimes(count);
    (fetch as jest.Mock).mockResolvedValue(json({ ok: true }));
    await checkConnection(true);
    expect(connection.blocked()).toBe(false);
    // Recovery only probes; it never replays the rejected POST.
    expect(
      (fetch as jest.Mock).mock.calls.filter(([, o]) => o.method === "POST")
    ).toHaveLength(0);
  } finally {
    stop();
  }
});
it("deduplicates lifecycle probes and does not let a late success clear authentication", async () => {
  let resolve!: (value: Response) => void;
  (fetch as jest.Mock).mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      })
  );
  const first = checkConnection(true);
  expect(checkConnection(true)).toBe(first);
  (fetch as jest.Mock).mockResolvedValue(json({}, 401));
  await expect(requestData("/api/playlist")).rejects.toMatchObject({
    kind: "auth",
  });
  resolve(json({ ok: true }));
  await first;
  expect(connection.getSnapshot().phase).toBe("auth");
  const count = (fetch as jest.Mock).mock.calls.length;
  await checkConnection();
  expect(fetch).toHaveBeenCalledTimes(count);
});
it("keeps transport errors distinct from expired authentication", async () => {
  (fetch as jest.Mock).mockRejectedValue(new TypeError("Failed to fetch"));
  await expect(requestData("/api/playlist")).rejects.toMatchObject({
    kind: "network",
  });
  expect(connection.getSnapshot().phase).toBe("ready");
});
