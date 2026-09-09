import { attendanceApi, AttendanceError } from "./api";
afterEach(() => jest.restoreAllMocks());
it("rejects an authentication HTML response instead of treating it as a photo", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    redirected: false,
    headers: { get: () => "text/html" },
  });
  await expect(attendanceApi.photo("p")).rejects.toMatchObject({ status: 401 });
});
it("rejects redirected JSON and includes no-store on attendance reads", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    redirected: true,
    headers: { get: () => "application/json" },
  });
  await expect(attendanceApi.page("p")).rejects.toBeInstanceOf(AttendanceError);
  expect(global.fetch).toHaveBeenCalledWith(
    "/api/attendance/pages/p",
    expect.objectContaining({ cache: "no-store" })
  );
});
