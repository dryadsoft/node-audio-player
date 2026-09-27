import { failureKind, FailureKind, RequestError, requestData } from "../api/connection";
import { Catalog, Center, Page, Period, Term, normalizePage } from "./types";
export class AttendanceError extends RequestError {
  constructor(message: string, status = 0, kind: FailureKind = failureKind(status)) {
    super(message, status, kind);
  }
}
async function request<T>(path: string, options: RequestInit = {}, photo = false): Promise<T> {
  try {
    return await requestData<T>(`/api/attendance/${path}`, options, {
      timeout: photo ? 60000 : 12000,
      image: photo && options.method !== "PUT",
    });
  } catch (error) {
    if (error instanceof RequestError) throw new AttendanceError(error.message, error.status, error.kind);
    throw error;
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
