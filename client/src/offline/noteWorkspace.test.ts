import { fixture, clone, note } from "../testSupport/noteFixture";
import { api, ApiError } from "../api";
import { NoteWorkspace } from "./noteWorkspace";
import { NoteStore } from "./noteStore";

beforeEach(() => {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
});
afterEach(() => {
  jest.restoreAllMocks();
});

it("downloads every unopened week with at most three simultaneous reads and restores offline", async () => {
  const f = fixture(["c1", "c2"]);
  const original = (
    api.lessonCurriculumWeek as jest.Mock
  ).getMockImplementation()!;
  let concurrent = 0,
    max = 0;
  (api.lessonCurriculumWeek as jest.Mock).mockImplementation(
    async (...args) => {
      max = Math.max(max, ++concurrent);
      await new Promise((resolve) => setTimeout(resolve, 1));
      try {
        return await original(...args);
      } finally {
        concurrent--;
      }
    }
  );
  await f.workspace.refresh();
  expect(f.workspace.getSnapshot().notes).toHaveLength(24);
  expect(max).toBe(3);
  Object.defineProperty(navigator, "onLine", { value: false });
  const reopened = new NoteWorkspace(f.store);
  await reopened.refresh();
  expect(reopened.detail("c2")?.weeks).toHaveLength(12);
  expect(
    reopened.getSnapshot().notes.find((n) => n.key === "c2:12")?.local.content
  ).toBe("수업 내용");
  expect(reopened.getSnapshot().connection).toBe("offline");
});

it("uploads all offline edits after recreation without opening their weeks", async () => {
  const f = fixture();
  await f.workspace.refresh();
  await f.edit("c1:2", { className: "둘째 주" });
  await f.edit("c1:12", { content: "마지막 주" });
  const reopened = new NoteWorkspace(f.store);
  await reopened.refresh();
  expect(f.data.get("c1")!.weeks[1].className).toBe("둘째 주");
  expect(f.data.get("c1")!.weeks[11].content).toBe("마지막 주");
  expect(reopened.getSnapshot().notes.filter((n) => n.dirty)).toHaveLength(0);
  expect(reopened.getSnapshot().notes).toHaveLength(12);
});

it("merges independent tablet edits and persists explicit same-field conflicts across restarts", async () => {
  const f = fixture();
  await f.workspace.refresh();
  await f.edit("c1:1", { className: "태블릿" });
  f.editRemote("c1", 1, { content: "서버" });
  await f.workspace.refresh();
  expect(f.data.get("c1")!.weeks[0]).toMatchObject({
    className: "태블릿",
    content: "서버",
  });
  await f.edit("c1:1", { className: "로컬 충돌" });
  f.editRemote("c1", 1, { className: "서버 충돌" });
  await f.workspace.refresh();
  const reopened = new NoteWorkspace(f.store);
  await reopened.hydrate();
  const record = reopened.getSnapshot().notes.find((n) => n.key === "c1:1")!;
  expect(record.conflicts).toHaveLength(1);
  await reopened.resolve(record.key, record.conflicts[0], "local");
  await f.store.change(record.key, (n) => n && { ...n, changedAt: 0 });
  await reopened.reload();
  await reopened.refresh();
  expect(f.data.get("c1")!.weeks[0].className).toBe("로컬 충돌");
});

it("preserves input entered while an acknowledgement is in flight", async () => {
  const f = fixture();
  await f.workspace.refresh();
  await f.edit("c1:1", { className: "전송" });
  let finish!: (value: ReturnType<typeof note>) => void;
  (api.updateLessonCurriculumWeek as jest.Mock).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const sync = f.workspace.refresh();
  while (!finish) await new Promise((resolve) => setTimeout(resolve, 1));
  await f.edit("c1:1", { className: "추가 입력" });
  finish(f.editRemote("c1", 1, { className: "전송" }));
  await sync;
  const record = f.workspace.getSnapshot().notes.find((n) => n.key === "c1:1")!;
  expect(record.local.className).toBe("추가 입력");
  expect(record.dirty).toBe(true);
  await f.workspace.refresh();
  expect(f.data.get("c1")!.weeks[0].className).toBe("추가 입력");
});

it("does not duplicate a committed write after its response was lost", async () => {
  const f = fixture();
  await f.workspace.refresh();
  await f.edit("c1:1", { content: "응답 유실" });
  (api.updateLessonCurriculumWeek as jest.Mock).mockImplementationOnce(
    async ({ id, week, content }) => {
      f.editRemote(id, week, { content });
      throw new TypeError("connection lost");
    }
  );
  await f.workspace.refresh();
  expect(
    f.workspace.getSnapshot().notes.find((n) => n.key === "c1:1")?.dirty
  ).toBe(true);
  await f.workspace.refresh(true);
  expect(api.updateLessonCurriculumWeek).toHaveBeenCalledTimes(1);
  expect(
    f.workspace.getSnapshot().notes.find((n) => n.key === "c1:1")?.dirty
  ).toBe(false);
});

it("caps 409 retries and keeps the edit recoverable", async () => {
  const f = fixture();
  await f.workspace.refresh();
  await f.edit("c1:1", { content: "보존" });
  (api.updateLessonCurriculumWeek as jest.Mock).mockRejectedValue(
    new ApiError("충돌", 409)
  );
  await f.workspace.refresh();
  expect(api.updateLessonCurriculumWeek).toHaveBeenCalledTimes(4);
  expect(
    f.workspace.getSnapshot().notes.find((n) => n.key === "c1:1")?.error
  ).toContain("변경이 계속");
  await f.workspace.refresh();
  expect(api.updateLessonCurriculumWeek).toHaveBeenCalledTimes(4);
});

it("defers remote ink and uploads throughout an active input gesture", async () => {
  const f = fixture();
  await f.workspace.refresh();
  f.workspace.block("c1:1", true);
  await f.edit("c1:1", { className: "필기 중" });
  f.editRemote("c1", 1, { content: "원격 변경" });
  await f.workspace.refresh();
  expect(
    f.workspace.getSnapshot().notes.find((n) => n.key === "c1:1")?.local.content
  ).toBe("수업 내용");
  expect(api.updateLessonCurriculumWeek).not.toHaveBeenCalled();
  f.workspace.block("c1:1", false);
  await f.workspace.refresh();
  expect(f.data.get("c1")!.weeks[0]).toMatchObject({
    className: "필기 중",
    content: "원격 변경",
  });
});

it("preserves dirty deleted notes but removes clean deleted copies", async () => {
  const f = fixture(["c1", "c2"]);
  await f.workspace.refresh();
  await f.edit("c1:12", { content: "복구" });
  f.data.clear();
  await f.workspace.refresh();
  expect(f.workspace.getSnapshot().curricula).toHaveLength(1);
  expect(f.workspace.getSnapshot().curricula[0].deleted).toBe(true);
  expect(f.workspace.detail("c1")?.weeks[11].content).toBe("복구");
  expect(api.updateLessonCurriculumWeek).not.toHaveBeenCalled();
});

it("never treats auth failure or malformed lists as deletion", async () => {
  const f = fixture();
  await f.workspace.refresh();
  await f.edit("c1:1", { className: "보존" });
  (api.lessonCurricula as jest.Mock).mockRejectedValueOnce(
    new ApiError("login", 401)
  );
  await f.workspace.refresh();
  expect(f.workspace.getSnapshot().connection).toBe("auth");
  (api.lessonCurricula as jest.Mock).mockResolvedValueOnce({ error: "bad" });
  await f.workspace.refresh(true);
  expect(f.workspace.getSnapshot().notes).toHaveLength(12);
  expect(f.workspace.getSnapshot().curricula[0].deleted).not.toBe(true);
  await f.workspace.refresh(true);
  expect(f.data.get("c1")!.weeks[0].className).toBe("보존");
});

it("does not upload failed local writes and retries the retained input", async () => {
  const f = fixture();
  await f.workspace.refresh();
  const original = f.workspace.getSnapshot().notes[0];
  jest
    .spyOn(f.store, "change")
    .mockRejectedValueOnce(new DOMException("full", "QuotaExceededError"));
  await expect(
    f.workspace.edit(original.key, original.local, {
      ...original.local,
      content: "저장 공간 부족",
    })
  ).rejects.toThrow();
  await f.workspace.refresh();
  expect(api.updateLessonCurriculumWeek).not.toHaveBeenCalled();
  expect(f.workspace.canNavigate()).toBe(false);
  await f.workspace.retry();
  expect(f.workspace.getSnapshot().notes[0].local.content).toBe(
    "저장 공간 부족"
  );
  expect(f.workspace.getSnapshot().storageError).toBe("");
});

it("merges stale tab writes atomically and grants a single upload lease", async () => {
  const f = fixture();
  await f.workspace.refresh();
  const stale = clone(f.workspace.getSnapshot().notes[0].local);
  await f.workspace.edit("c1:1", stale, { ...stale, className: "탭 A" });
  await f.workspace.edit("c1:1", stale, { ...stale, content: "탭 B" });
  expect(f.workspace.getSnapshot().notes[0].local).toMatchObject({
    className: "탭 A",
    content: "탭 B",
  });
  expect(await f.store.claim("c1:1", "one")).toBe(true);
  expect(await f.store.claim("c1:1", "two")).toBe(false);
  await f.store.release("c1:1", "one");
  expect(await f.store.claim("c1:1", "two")).toBe(true);
});

it("retains partial downloads and resumes only missing weeks", async () => {
  const f = fixture();
  (api.lessonCurriculumWeek as jest.Mock).mockRejectedValueOnce(
    new TypeError("offline")
  );
  await f.workspace.refresh();
  const downloaded = f.workspace.getSnapshot().notes.length;
  expect(downloaded).toBeGreaterThan(0);
  expect(downloaded).toBeLessThan(12);
  (api.lessonCurriculumWeek as jest.Mock).mockClear();
  await f.workspace.refresh(true);
  expect(f.workspace.getSnapshot().notes).toHaveLength(12);
  expect(api.lessonCurriculumWeek).toHaveBeenCalledTimes(12 - downloaded);
});

it("migrates legacy drafts exactly once and keeps missing ancestors explicit", async () => {
  const name = `legacy-${Date.now()}`;
  await new Promise<void>((resolve, reject) => {
    const r = indexedDB.open(name, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore("lesson-note-weeks").put(note(), "c1:1");
    };
    r.onerror = () => reject(r.error);
    r.onsuccess = () => {
      r.result.close();
      resolve();
    };
  });
  const store = new NoteStore(name);
  const first = await store.read();
  expect(first.notes[0].base).toBeUndefined();
  expect(first.notes[0].dirty).toBe(true);
  await store.change(
    "c1:1",
    (n) => n && { ...n, local: { ...n.local, className: "이관 후 수정" } }
  );
  await store.close();
  expect((await store.read()).notes[0].local.className).toBe("이관 후 수정");
});

it("does not regress a newer remote revision when an older acknowledgement arrives late", async () => {
  const f = fixture();
  await f.workspace.refresh();
  await f.edit("c1:1", { className: "첫 전송" });
  let finish!: (v: ReturnType<typeof note>) => void;
  (api.updateLessonCurriculumWeek as jest.Mock).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const run = f.workspace.refresh();
  while (!finish) await new Promise((resolve) => setTimeout(resolve, 1));
  const acknowledged = f.editRemote("c1", 1, { className: "첫 전송" });
  const newer = f.editRemote("c1", 1, { content: "다른 기기의 후속 수정" });
  await f.store.change(
    "c1:1",
    (n) =>
      n && {
        ...n,
        base: newer,
        local: newer,
        dirty: false,
        version: n.version + 1,
      }
  );
  finish(acknowledged);
  await run;
  expect(
    f.workspace.getSnapshot().notes.find((n) => n.key === "c1:1")?.base
      ?.revision
  ).toBe(newer.revision);
  expect(f.workspace.detail("c1")?.weeks[0].content).toBe(
    "다른 기기의 후속 수정"
  );
});

it("retains edits made after a conflict appeared when choosing the local side", async () => {
  const f = fixture();
  await f.workspace.refresh();
  await f.edit("c1:1", { className: "내 초안" });
  f.editRemote("c1", 1, { className: "다른 초안" });
  await f.workspace.refresh();
  await f.edit("c1:1", { className: "충돌 확인 중 추가 입력" });
  const record = f.workspace.getSnapshot().notes.find((n) => n.key === "c1:1")!;
  await f.workspace.resolve(record.key, record.conflicts[0], "local");
  expect(
    f.workspace.getSnapshot().notes.find((n) => n.key === "c1:1")?.local
      .className
  ).toBe("충돌 확인 중 추가 입력");
});

it("accepts server text normalization without an endless dirty loop", async () => {
  const f = fixture();
  await f.workspace.refresh();
  await f.edit("c1:1", { className: "  공백 정리  " });
  (api.updateLessonCurriculumWeek as jest.Mock).mockImplementationOnce(
    async ({ id, week, className }) =>
      f.editRemote(id, week, { className: className.trim() })
  );
  await f.workspace.refresh();
  await f.workspace.refresh();
  expect(api.updateLessonCurriculumWeek).toHaveBeenCalledTimes(1);
  expect(
    f.workspace.getSnapshot().notes.find((n) => n.key === "c1:1")?.dirty
  ).toBe(false);
});

it("includes earlier failed input when a later queued edit successfully saves", async () => {
  const f = fixture();
  await f.workspace.refresh();
  const original = f.workspace.getSnapshot().notes[0].local;
  const first = { ...original, className: "첫 저장은 실패" };
  const second = { ...first, content: "다음 입력까지 보존" };
  jest
    .spyOn(f.store, "change")
    .mockRejectedValueOnce(new DOMException("full", "QuotaExceededError"));
  const writes = await Promise.allSettled([
    f.workspace.edit("c1:1", original, first),
    f.workspace.edit("c1:1", first, second),
  ]);
  expect(writes[0].status).toBe("rejected");
  expect(writes[1].status).toBe("fulfilled");
  expect(f.workspace.getSnapshot().notes[0].local).toMatchObject({
    className: first.className,
    content: second.content,
  });
  expect(f.workspace.getSnapshot().notes[0].conflicts).toHaveLength(0);
  expect(f.workspace.getSnapshot().storageError).toBe("");
});

it("converges two independent tablet databases without dropping either edit", async () => {
  const f = fixture();
  const second = new NoteWorkspace(
    new NoteStore(`second-device-${Date.now()}`)
  );
  await f.workspace.refresh();
  await second.refresh();
  await f.edit("c1:1", { className: "iPad 수정" });
  await f.edit("c1:1", { content: "Android 수정" }, second);
  await f.workspace.refresh();
  await second.refresh();
  await f.workspace.refresh();
  for (const workspace of [f.workspace, second]) {
    const record = workspace.getSnapshot().notes.find((n) => n.key === "c1:1")!;
    expect(record.local).toMatchObject({
      className: "iPad 수정",
      content: "Android 수정",
    });
    expect(record.dirty).toBe(false);
    expect(record.conflicts).toHaveLength(0);
  }
});
