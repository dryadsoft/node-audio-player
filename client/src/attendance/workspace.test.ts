import "fake-indexeddb/auto";
import { api } from "../api";
import { attendanceApi, AttendanceError } from "./api";
import { AttendanceStore } from "./store";
import { AttendanceWorkspace } from "./workspace";
import { Page, Term } from "./types";
import { InkDocumentV2, InkStrokeV2 } from "../types";
Object.defineProperty(global, "structuredClone", {
  configurable: true,
  value: (v: any): any =>
    v instanceof Blob
      ? v
      : Array.isArray(v)
      ? v.map((x: any) => (global as any).structuredClone(x))
      : v && typeof v === "object"
      ? Object.fromEntries(
          Object.entries(v).map(([k, x]) => [
            k,
            (global as any).structuredClone(x),
          ])
        )
      : v,
});
let serial = 0;
Object.defineProperty(global, "crypto", {
  configurable: true,
  value: { randomUUID: () => `local-${++serial}` },
});
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const term: Term = { year: 2026, term: "fall" };
const stroke = (id: string, x = 0.1): InkStrokeV2 => ({
  id,
  page: 0,
  width: 2,
  color: "#111827",
  points: [[x, 0.2, 0.5, 0]],
});
const ink = (...s: InkStrokeV2[]): InkDocumentV2 => ({
  version: 2,
  pageCount: 1,
  aspectRatio: 1,
  strokes: s,
});
const page = (id: string): Page => ({
  id,
  periodId: "period",
  imageHash: "hash",
  width: 100,
  height: 100,
  position: 0,
  revision: 1,
  deletedAt: null,
  updatedAt: "t",
  inkDocument: ink(),
});
function fixture() {
  const remote = new Map([
    ["one", page("one")],
    ["two", page("two")],
  ]);
  let offline = false,
    deleted = false,
    centerDeleted = false;
  jest.spyOn(api, "lessonLocations").mockResolvedValue([]);
  jest.spyOn(attendanceApi, "snapshot").mockImplementation(async () => {
    if (offline) throw new AttendanceError("offline");
    return {
      centers: [
        {
          ...term,
          id: "center",
          locationId: "loc",
          weekday: 1,
          revision: 1,
          deletedAt: centerDeleted ? "t" : null,
        },
      ],
      periods: [
        {
          id: "period",
          centerId: "center",
          name: "반",
          position: 0,
          revision: 1,
          deletedAt: deleted ? "t" : null,
        },
      ],
      pages: Array.from(remote.values()).map((p) => {
        const { inkDocument, ...meta } = p;
        return clone(meta);
      }),
    };
  });
  jest.spyOn(attendanceApi, "page").mockImplementation(async (id) => {
    if (offline) throw new AttendanceError("offline");
    return clone(remote.get(id)!);
  });
  jest.spyOn(attendanceApi, "photo").mockImplementation(async () => {
    if (offline) throw new AttendanceError("offline");
    return new Blob(["photo"], { type: "image/jpeg" });
  });
  jest
    .spyOn(attendanceApi, "upload")
    .mockImplementation(async (id, periodId) => {
      if (offline) throw new AttendanceError("offline");
      const p = remote.get(id) || { ...page(id), periodId };
      remote.set(id, p);
      return clone(p);
    });
  jest
    .spyOn(attendanceApi, "changePage")
    .mockImplementation(async (id, input: any) => {
      if (offline) throw new AttendanceError("offline");
      const p = remote.get(id)!;
      if (input.expectedRevision !== p.revision)
        throw new AttendanceError("conflict", 409);
      const next = { ...p, ...input, revision: p.revision + 1 };
      delete (next as any).expectedRevision;
      remote.set(id, clone(next));
      return clone(next);
    });
  const store = new AttendanceStore(`attendance-${++serial}`),
    ws = new AttendanceWorkspace(store);
  return {
    remote,
    store,
    ws,
    offline: (v: boolean) => {
      offline = v;
    },
    deleteCenter: (value = true) => {
      centerDeleted = value;
    },
    deletePeriod: () => {
      deleted = true;
    },
  };
}
const ready = async (f: ReturnType<typeof fixture>) => {
  await f.ws.hydrate();
  await f.ws.setTarget(term);
  await f.ws.sync();
};
const edit = async (
  ws: AttendanceWorkspace,
  id: string,
  value: InkDocumentV2
) => {
  ws.edit(id, value);
  await ws.retry();
};
afterEach(() => jest.restoreAllMocks());
it("preserves offline ink and local-only photos through center trash, restart and restoration", async () => {
  const f = fixture();
  await ready(f);
  f.offline(true);
  await edit(f.ws, "one", ink(stroke("saved-ink")));
  const id = await f.ws.add(
    term,
    "period",
    new Blob(["offline photo"]),
    100,
    100
  );
  await f.ws.sync();
  await edit(f.ws, id, ink(stroke("new-ink")));
  f.deleteCenter();
  f.offline(false);
  (attendanceApi.upload as jest.Mock).mockClear();
  (attendanceApi.changePage as jest.Mock).mockClear();
  await f.ws.sync();
  for (const pageId of ["one", id]) {
    expect(f.ws.getSnapshot().pages.find((p) => p.id === pageId)).toMatchObject(
      { dirty: true, remoteDeleted: true }
    );
  }
  expect(attendanceApi.upload).not.toHaveBeenCalled();
  expect(attendanceApi.changePage).not.toHaveBeenCalled();
  await expect(f.ws.add(term, "period", new Blob(), 100, 100)).rejects.toThrow(
    "복구"
  );
  f.ws.edit("one", ink());
  expect(
    f.ws.getSnapshot().pages.find((p) => p.id === "one")!.local.inkDocument
      .strokes
  ).toHaveLength(1);
  const reopened = new AttendanceWorkspace(f.store);
  await reopened.hydrate();
  expect(reopened.getSnapshot().catalogs[0].centers[0].deletedAt).toBe("t");
  expect(await f.store.photo(id)).toBeInstanceOf(Blob);
  f.deleteCenter(false);
  await reopened.sync();
  expect(f.remote.get("one")!.inkDocument.strokes[0].id).toBe("saved-ink");
  expect(f.remote.get(id)!.inkDocument.strokes[0].id).toBe("new-ink");
  expect(
    reopened.getSnapshot().pages.every((p) => !p.dirty && !p.remoteDeleted)
  ).toBe(true);
});
it("stops sending when a center is deleted after the snapshot and resumes after restoration", async () => {
  const f = fixture();
  await ready(f);
  f.offline(true);
  await edit(f.ws, "one", ink(stroke("keep")));
  f.offline(false);
  (attendanceApi.changePage as jest.Mock).mockImplementationOnce(async () => {
    f.deleteCenter();
    throw new AttendanceError("센터를 먼저 복구하세요.", 409);
  });
  await f.ws.sync();
  expect(f.ws.getSnapshot().pages.find((p) => p.id === "one")).toMatchObject({
    dirty: true,
    remoteDeleted: true,
  });
  f.deleteCenter(false);
  await f.ws.sync();
  expect(f.remote.get("one")!.inkDocument.strokes[0].id).toBe("keep");
});
it("does not automatically download photos in trashed centers and reads older cached centers as active", async () => {
  const f = fixture();
  f.deleteCenter();
  await ready(f);
  expect(attendanceApi.photo).not.toHaveBeenCalled();
  const cached = f.ws.getSnapshot().catalogs[0];
  const { deletedAt, ...legacyCenter } = cached.centers[0];
  await f.store.catalog("2026:fall", {
    ...cached,
    centers: [legacyCenter],
  } as any);
  expect((await f.store.hydrate()).catalogs[0].centers[0].deletedAt).toBeNull();
});
it("downloads all photos and restores them offline", async () => {
  const f = fixture();
  await ready(f);
  expect(f.ws.getSnapshot().pages).toHaveLength(2);
  expect(await f.store.photo("two")).toBeInstanceOf(Blob);
  f.offline(true);
  const reopened = new AttendanceWorkspace(f.store);
  await reopened.hydrate();
  await reopened.sync();
  expect(reopened.getSnapshot().pages.every((p) => p.photoReady)).toBe(true);
  expect(reopened.getSnapshot().target).toEqual(term);
});
it("persists an offline photo and ink across restart then uploads only once", async () => {
  const f = fixture();
  await ready(f);
  f.offline(true);
  const id = await f.ws.add(
    term,
    "period",
    new Blob(["new"], { type: "image/jpeg" }),
    100,
    100
  );
  await f.ws.sync();
  await edit(f.ws, id, ink(stroke("a")));
  const reopened = new AttendanceWorkspace(f.store);
  await reopened.hydrate();
  expect(reopened.getSnapshot().pages.find((p) => p.id === id)?.dirty).toBe(
    true
  );
  f.offline(false);
  await reopened.sync();
  expect(f.remote.get(id)?.inkDocument.strokes).toEqual([stroke("a")]);
  expect(reopened.getSnapshot().pages.find((p) => p.id === id)?.dirty).toBe(
    false
  );
  const calls = (attendanceApi.upload as jest.Mock).mock.calls.length;
  await reopened.sync();
  expect((attendanceApi.upload as jest.Mock).mock.calls).toHaveLength(calls);
});
it("merges independent devices and asks only about overlapping strokes", async () => {
  const f = fixture();
  await ready(f);
  const second = new AttendanceWorkspace(
    new AttendanceStore(`second-${++serial}`)
  );
  await second.hydrate();
  await second.setTarget(term);
  await second.sync();
  f.offline(true);
  await edit(f.ws, "one", ink(stroke("a")));
  await edit(second, "one", ink(stroke("b")));
  f.offline(false);
  await f.ws.sync();
  await second.sync();
  await f.ws.sync();
  expect(
    new Set(f.remote.get("one")!.inkDocument.strokes.map((s) => s.id))
  ).toEqual(new Set(["a", "b"]));
  await second.sync();
  f.offline(true);
  await edit(f.ws, "one", ink(stroke("a", 0.3), stroke("b")));
  await edit(second, "one", ink(stroke("a", 0.7), stroke("b")));
  f.offline(false);
  await f.ws.sync();
  await second.sync();
  expect(
    second.getSnapshot().pages.find((p) => p.id === "one")?.conflicts
  ).toHaveLength(1);
  await second.resolve("one", "a", "local");
  await second.sync();
  expect(
    f.remote.get("one")!.inkDocument.strokes.find((s) => s.id === "a")!
      .points[0][0]
  ).toBe(0.7);
});
it("protects input created while an acknowledgement is in flight", async () => {
  const f = fixture();
  await ready(f);
  f.offline(true);
  await edit(f.ws, "one", ink(stroke("a")));
  f.offline(false);
  let release!: (v: Page) => void, entered!: () => void;
  const waiting = new Promise<void>((r) => {
    entered = r;
  });
  (attendanceApi.changePage as jest.Mock).mockImplementationOnce(async () => {
    entered();
    return new Promise<Page>((r) => {
      release = r;
    });
  });
  const syncing = f.ws.sync();
  await waiting;
  f.ws.edit("one", ink(stroke("a"), stroke("b")));
  for (let n = 0; n < 30 && f.ws.getSnapshot().unsaved; n++)
    await new Promise((r) => setTimeout(r, 0));
  const ack = { ...page("one"), revision: 2, inkDocument: ink(stroke("a")) };
  f.remote.set("one", ack);
  release(ack);
  await syncing;
  const r = f.ws.getSnapshot().pages.find((p) => p.id === "one")!;
  expect(r.local.inkDocument.strokes.map((s) => s.id)).toEqual(["a", "b"]);
  expect(r.dirty).toBe(true);
  expect(r.historyKey || 0).toBe(0);
  await f.ws.sync();
  expect(f.remote.get("one")!.inkDocument.strokes).toHaveLength(2);
});
it("retains all subsequent input after a storage error", async () => {
  const f = fixture();
  await ready(f);
  f.offline(true);
  jest.spyOn(f.store, "mutate").mockRejectedValueOnce(new Error("quota"));
  f.ws.edit("one", ink(stroke("a")));
  await new Promise((r) => setTimeout(r, 0));
  expect(f.ws.getSnapshot().storageError).toContain("quota");
  f.ws.edit("one", ink(stroke("a"), stroke("b")));
  await f.ws.retry();
  expect(f.ws.getSnapshot().unsaved).toBe(0);
  expect(
    (await f.store.hydrate()).pages.find((p) => p.id === "one")!.local
      .inkDocument.strokes
  ).toHaveLength(2);
});
it("keeps dirty strokes when remote page or period is trashed and resumes after restore", async () => {
  const f = fixture();
  await ready(f);
  f.offline(true);
  await edit(f.ws, "one", ink(stroke("a")));
  f.remote.set("one", { ...page("one"), revision: 2, deletedAt: "t" });
  f.offline(false);
  await f.ws.sync();
  let r = f.ws.getSnapshot().pages.find((p) => p.id === "one")!;
  expect(r.remoteDeleted).toBe(true);
  expect(r.local.inkDocument.strokes).toHaveLength(1);
  f.remote.set("one", { ...page("one"), revision: 3 });
  await f.ws.sync();
  expect(f.remote.get("one")!.inkDocument.strokes).toHaveLength(1);
  f.offline(true);
  await edit(f.ws, "two", ink(stroke("b")));
  f.deletePeriod();
  f.offline(false);
  await f.ws.sync();
  r = f.ws.getSnapshot().pages.find((p) => p.id === "two")!;
  expect(r.remoteDeleted).toBe(true);
  expect(r.dirty).toBe(true);
});
it("bounds conflicts and continues uploading unaffected pages", async () => {
  const f = fixture();
  await ready(f);
  f.offline(true);
  await edit(f.ws, "one", ink(stroke("a")));
  await edit(f.ws, "two", ink(stroke("b")));
  f.offline(false);
  const original = (
    attendanceApi.changePage as jest.Mock
  ).getMockImplementation()!;
  (attendanceApi.changePage as jest.Mock).mockImplementation((id, input) =>
    id === "one"
      ? Promise.reject(new AttendanceError("conflict", 409))
      : original(id, input)
  );
  await f.ws.sync();
  expect(
    (attendanceApi.changePage as jest.Mock).mock.calls.filter(
      (c) => c[0] === "one"
    )
  ).toHaveLength(4);
  expect(f.remote.get("two")!.inkDocument.strokes).toHaveLength(1);
});
it("continues preparing other photos when one download fails", async () => {
  const f = fixture();
  (attendanceApi.photo as jest.Mock).mockImplementation(async (id) => {
    if (id === "one") throw new AttendanceError("missing photo", 404);
    return new Blob(["photo"], { type: "image/jpeg" });
  });
  await ready(f);
  expect(f.ws.getSnapshot().pages.find((p) => p.id === "two")?.photoReady).toBe(
    true
  );
  expect(f.ws.getSnapshot().pages.find((p) => p.id === "one")).toBeUndefined();
  expect(f.ws.getSnapshot().error).toContain("missing photo");
});
it("reports failed photo persistence without marking the photo ready", async () => {
  const f = fixture();
  jest.spyOn(f.store, "mutate").mockRejectedValue(new Error("quota"));
  await ready(f);
  expect(f.ws.getSnapshot().storageError).toContain("quota");
  expect(f.ws.getSnapshot().pages).toHaveLength(0);
});
it("clears a recovered storage warning after successfully preparing photos", async () => {
  const f = fixture();
  const failure = jest
    .spyOn(f.store, "mutate")
    .mockRejectedValue(new Error("quota"));
  await ready(f);
  expect(f.ws.getSnapshot().storageError).toContain("quota");
  failure.mockRestore();
  await f.ws.retry();
  expect(f.ws.getSnapshot().storageError).toBe("");
  expect(f.ws.getSnapshot().pages).toHaveLength(2);
});
