import { api } from "./index";
const response = (
  payload: unknown,
  type = "application/json",
  redirected = false
) =>
  ({
    ok: true,
    status: 200,
    redirected,
    headers: { get: () => type },
    json: async () => payload,
  } as unknown as Response);
beforeEach(() => {
  if (!window.fetch) window.fetch = jest.fn();
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});
it("rejects successful HTML login pages and redirected note responses", async () => {
  const fetch = jest
    .spyOn(window, "fetch")
    .mockResolvedValueOnce(response({}, "text/html"))
    .mockResolvedValueOnce(response([], "application/json", true));
  await expect(api.lessonCurricula()).rejects.toMatchObject({ status: 401 });
  await expect(api.lessonCurricula()).rejects.toMatchObject({ status: 401 });
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("encodes note identifiers and bypasses browser API caches", async () => {
  const fetch = jest.spyOn(window, "fetch").mockResolvedValue(response({}));
  await api.lessonCurriculumWeek("가을 수업/1", 2);
  expect(fetch).toHaveBeenCalledWith(
    `/api/lesson-curricula/${encodeURIComponent("가을 수업/1")}/weeks/2`,
    expect.objectContaining({
      cache: "no-store",
      signal: expect.any(AbortSignal),
    })
  );
});
it("keeps the timeout active until the JSON body finishes", async () => {
  jest.useFakeTimers();
  jest
    .spyOn(window, "fetch")
    .mockImplementation(
      async (_url, options) =>
        ({
          ...response({}),
          json: () =>
            new Promise((_resolve, reject) =>
              options?.signal?.addEventListener("abort", () =>
                reject(new DOMException("timeout", "AbortError"))
              )
            ),
        } as Response)
    );
  const pending = api.lessonCurricula();
  const rejected = expect(pending).rejects.toMatchObject({
    name: "AbortError",
  });
  await Promise.resolve();
  jest.advanceTimersByTime(10000);
  await rejected;
});
