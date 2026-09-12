import { Catalog, Center, Page, Period, Term, normalizePage } from "./types";
export class AttendanceError extends Error {
  constructor(message: string, readonly status = 0) {
    super(message);
  }
}
async function request<T>(
  path: string,
  options: RequestInit = {},
  photo = false
): Promise<T> {
  const controller = new AbortController(),
    timer = window.setTimeout(() => controller.abort(), photo ? 60000 : 12000);
  try {
    const response = await fetch(`/api/attendance/${path}`, {
      ...options,
      cache: "no-store",
      signal: controller.signal,
      headers:
        options.body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" },
    });
    const type = response.headers.get("content-type") || "";
    if (
      response.redirected ||
      response.status === 401 ||
      response.status === 403 ||
      (response.ok &&
        !type.includes(
          photo && options.method !== "PUT" ? "image/jpeg" : "application/json"
        ))
    )
      throw new AttendanceError(
        "로그인이 필요합니다. 기기 기록은 유지됩니다.",
        401
      );
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new AttendanceError(
        String(body?.message || "출석부 요청에 실패했습니다."),
        response.status
      );
    }
    return (
      photo && options.method !== "PUT"
        ? await response.blob()
        : await response.json()
    ) as T;
  } catch (e) {
    if (e instanceof AttendanceError) throw e;
    throw new AttendanceError(
      "서버에 연결하지 못했습니다. 기기 기록은 유지됩니다."
    );
  } finally {
    window.clearTimeout(timer);
  }
}
export const attendanceApi = {
  snapshot: (t: Term) =>
    request<Catalog>(`snapshot?year=${t.year}&term=${t.term}`).then(
      (catalog) => ({ ...catalog, pages: catalog.pages.map(normalizePage) })
    ),
  center: (input: unknown) =>
    request<Center>("centers", { method: "PUT", body: JSON.stringify(input) }),
  createPeriod: (centerId: string, name: string) =>
    request<Period>("periods", {
      method: "POST",
      body: JSON.stringify({ centerId, name }),
    }),
  period: (id: string, input: unknown) =>
    request<Period>(`periods/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  page: (id: string) =>
    request<Page>(`pages/${encodeURIComponent(id)}`).then(normalizePage),
  createNote: (id: string, periodId: string) =>
    request<Page>(`pages/${encodeURIComponent(id)}/note`, {
      method: "PUT",
      body: JSON.stringify({ periodId }),
    }).then(normalizePage),
  changePage: (id: string, input: unknown) =>
    request<Page>(`pages/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }).then(normalizePage),
  photo: (id: string) =>
    request<Blob>(`pages/${encodeURIComponent(id)}/photo`, {}, true),
  upload: (id: string, periodId: string, blob: Blob) => {
    const body = new FormData();
    body.append("periodId", periodId);
    body.append("photo", blob, "attendance.jpg");
    return request<Page>(
      `pages/${encodeURIComponent(id)}/photo`,
      { method: "PUT", body },
      true
    ).then(normalizePage);
  },
};
