import { replaceStrokeGroup, strokeGroupChoice, StrokeChoice } from "../api/inkStrokeGroups";
import { api, ApiError } from "../api";
import {
  equal,
  mergeLessonNote,
  NoteConflict,
  normalizeInk,
} from "../api/mergeLessonNote";
import {
  LessonCurriculum,
  LessonCurriculumSummary,
  LessonCurriculumWeek,
} from "../types";
import {
  LocalCurriculum,
  LocalNote,
  NoteStore,
  NoteStorageError,
  noteKey,
  StoredNotes,
} from "./noteStore";

export const sameNote = (
  a: LessonCurriculumWeek | undefined,
  b: LessonCurriculumWeek
) =>
  !!a &&
  a.className === b.className &&
  a.content === b.content &&
  equal(a.inkDocument, b.inkDocument);
export interface WorkspaceSnapshot extends StoredNotes {
  hydrated: boolean;
  connection: "checking" | "online" | "offline" | "auth" | "error";
  fetching: boolean;
  error: string;
  storageError: string;
  saving: string[];
}
const isSummary = (v: LessonCurriculumSummary) =>
  v &&
  typeof v.id === "string" &&
  !!v.id &&
  Number.isInteger(v.year) &&
  ["spring", "summer", "fall", "winter"].includes(v.term) &&
  typeof v.programName === "string" &&
  typeof v.updatedAt === "string";
const isWeek = (v: LessonCurriculumWeek) =>
  v &&
  Number.isInteger(v.week) &&
  v.week >= 1 &&
  v.week <= 12 &&
  Number.isInteger(v.revision) &&
  v.revision > 0 &&
  typeof v.className === "string" &&
  typeof v.content === "string" &&
  typeof v.updatedAt === "string" &&
  v.inkDocument &&
  [1, 2].includes(v.inkDocument.version) &&
  Array.isArray(v.inkDocument.strokes) &&
  v.inkDocument.strokes.every(
    (s) => typeof s.id === "string" && Array.isArray(s.points)
  );
const message = (error: unknown) =>
  error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";

export class NoteWorkspace {
  private snapshot: WorkspaceSnapshot = {
    notes: [],
    curricula: [],
    hydrated: false,
    connection: "checking",
    fetching: false,
    error: "",
    storageError: "",
    saving: [],
  };
  private listeners = new Set<() => void>();
  private hydrated?: Promise<void>;
  private cycle?: Promise<void>;
  private blocked = new Set<string>();
  private writes = new Map<string, number>();
  private writeQueues = new Map<string, Promise<void>>();
  private failedAncestors = new Map<string, LessonCurriculumWeek>();
  private volatile = new Map<
    string,
    { expected: LessonCurriculumWeek; local: LessonCurriculumWeek }
  >();
  private owner = `${Date.now()}-${Math.random()}`;
  private refs = 0;
  private timer?: number;
  private debounce?: number;
  private channel?: BroadcastChannel;
  private retryAt = 0;
  private failures = 0;
  constructor(readonly store = new NoteStore()) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<WorkspaceSnapshot> = {}) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  private loadVersion = 0;
  async reload() {
    const version = ++this.loadVersion;
    const stored = await this.store.read();
    if (version === this.loadVersion) this.publish(stored);
  }
  private accept(note?: LocalNote) {
    if (!note) return;
    const previous = this.snapshot.notes.find((n) => n.key === note.key);
    if (previous && previous.version >= note.version) return;
    this.publish({
      notes: previous
        ? this.snapshot.notes.map((n) => (n.key === note.key ? note : n))
        : [...this.snapshot.notes, note],
    });
  }
  private async saveCurriculum(value: LocalCurriculum) {
    await this.store.putCurriculum(value);
    const previous = this.snapshot.curricula.some((c) => c.id === value.id);
    this.publish({
      curricula: previous
        ? this.snapshot.curricula.map((c) => (c.id === value.id ? value : c))
        : [...this.snapshot.curricula, value],
    });
  }
  private changed(key?: string) {
    if (this.channel) this.channel.postMessage({ key });
    else {
      try {
        window.localStorage.setItem(
          "lesson-notes.changed",
          `${Date.now()}:${Math.random()}`
        );
      } catch {
        /* The IndexedDB transaction already succeeded. */
      }
    }
  }
  private storageChanged = (event: StorageEvent) => {
    if (event.key === "lesson-notes.changed")
      void this.reload().catch((error) => this.storageFailure(error));
  };
  hydrate() {
    if (!this.hydrated)
      this.hydrated = this.reload()
        .then(() => this.publish({ hydrated: true }))
        .catch((error) => {
          this.hydrated = undefined;
          this.publish({
            hydrated: true,
            storageError: `기기 저장을 읽지 못했습니다. ${message(error)}`,
          });
        });
    return this.hydrated;
  }
  start = () => {
    if (++this.refs === 1) {
      if (typeof BroadcastChannel !== "undefined") {
        this.channel = new BroadcastChannel("lesson-notes");
        this.channel.onmessage = (event) => {
          const key = event.data?.key;
          (typeof key === "string"
            ? this.store.getNote(key).then((note) => this.accept(note))
            : this.reload()
          ).catch((error) => this.storageFailure(error));
        };
      }
      window.addEventListener("storage", this.storageChanged);
      window.addEventListener("beforeunload", this.beforeUnload);
      window.addEventListener("online", this.wake);
      window.addEventListener("offline", this.offline);
      window.addEventListener("focus", this.wake);
      document.addEventListener("visibilitychange", this.wake);
      this.timer = window.setInterval(() => {
        void this.refresh();
      }, 2000);
      void this.refresh();
    }
    return () => {
      if (--this.refs) return;
      window.clearInterval(this.timer);
      window.clearTimeout(this.debounce);
      window.removeEventListener("storage", this.storageChanged);
      window.removeEventListener("beforeunload", this.beforeUnload);
      window.removeEventListener("online", this.wake);
      window.removeEventListener("offline", this.offline);
      window.removeEventListener("focus", this.wake);
      document.removeEventListener("visibilitychange", this.wake);
      this.channel?.close();
      this.channel = undefined;
    };
  };
  private beforeUnload = (event: BeforeUnloadEvent) => {
    if (!this.canNavigate()) {
      event.preventDefault();
      event.returnValue = "";
    }
  };
  private offline = () => this.publish({ connection: "offline" });
  private wake = () => {
    if (!document.hidden) {
      this.retryAt = 0;
      void this.refresh(true);
    }
  };
  block(key: string, active: boolean) {
    if (active) this.blocked.add(key);
    else {
      this.blocked.delete(key);
      this.schedule();
    }
  }
  private busy(key: string) {
    return (
      this.blocked.has(key) || !!this.writes.get(key) || this.volatile.has(key)
    );
  }
  private schedule() {
    if (!this.refs) return;
    window.clearTimeout(this.debounce);
    this.debounce = window.setTimeout(() => {
      void this.refresh();
    }, 700);
  }
  private storageFailure(error: unknown) {
    this.publish({
      storageError: `기기에 저장하지 못했습니다. ${message(error)}`,
    });
  }
  pendingCount() {
    return new Set([
      ...this.snapshot.notes
        .filter((n) => n.dirty || n.conflicts.length)
        .map((n) => n.key),
      ...Array.from(this.volatile.keys()),
    ]).size;
  }
  hasUnstored(key: string) {
    return this.volatile.has(key);
  }
  canNavigate() {
    return (
      !this.volatile.size &&
      !this.blocked.size &&
      !Array.from(this.writes.values()).some(Boolean)
    );
  }
  async edit(
    key: string,
    expected: LessonCurriculumWeek,
    local: LessonCurriculumWeek
  ) {
    this.volatile.set(key, { expected, local });
    this.writes.set(key, (this.writes.get(key) || 0) + 1);
    this.publish();
    const previousWrite = this.writeQueues.get(key);
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.writeQueues.set(key, barrier);
    if (previousWrite) await previousWrite;
    // A later keystroke also contains earlier input whose write may have failed.
    const ancestor = this.failedAncestors.get(key) || expected;
    try {
      const savedRecord = await this.store.change(key, (current) => {
        if (!current) throw new Error("저장된 주차를 찾지 못했습니다.");
        const result = sameNote(current.local, ancestor)
          ? { merged: local, conflicts: [] }
          : mergeLessonNote(ancestor, local, current.local);
        const conflicts = new Map<string, NoteConflict>(
          current.conflicts.map((c) => [
            c.id,
            {
              ...c,
              local: c.id.startsWith("stroke:")
                ? strokeGroupChoice(normalizeInk(result.merged.inkDocument).strokes, c.id.slice(7))
                : result.merged[c.id as "className" | "content"],
            },
          ])
        );
        result.conflicts.forEach((c) => conflicts.set(c.id, c));
        return {
          ...current,
          local: result.merged,
          conflicts: Array.from(conflicts.values()),
          version: current.version + 1,
          dirty: !sameNote(current.base, result.merged),
          changedAt: Date.now(),
          error: undefined,
        };
      });
      this.failedAncestors.delete(key);
      if (this.volatile.get(key)?.local === local) this.volatile.delete(key);
      this.accept(savedRecord);
      if (!this.volatile.size) this.publish({ storageError: "" });
      this.changed(key);
      this.schedule();
    } catch (error) {
      this.failedAncestors.set(key, ancestor);
      this.storageFailure(error);
      throw error;
    } finally {
      this.writes.set(key, (this.writes.get(key) || 1) - 1);
      if (this.writeQueues.get(key) === barrier) this.writeQueues.delete(key);
      release();
      this.publish();
    }
  }
  async retry() {
    await this.hydrate();
    for (const [key, value] of Array.from(this.volatile)) {
      try {
        await this.edit(key, value.expected, value.local);
      } catch {
        return;
      }
    }
    try {
      for (const note of this.snapshot.notes.filter((n) => n.error))
        await this.store.change(
          note.key,
          (n) => n && { ...n, version: n.version + 1, error: undefined }
        );
      await this.reload();
      this.publish({ storageError: "" });
      this.retryAt = 0;
      await this.refresh(true);
    } catch (error) {
      this.storageFailure(error);
    }
  }
  async resolve(key: string, conflict: NoteConflict, side: "local" | "server") {
    try {
      const savedRecord = await this.store.change(key, (current) => {
        if (!current) return;
        // A stale tab must not settle a conflict that has since changed.
        const actual = current.conflicts.find((c) => c.id === conflict.id);
        if (!actual || !equal(actual, conflict)) return current;
        const value = actual[side];
        const local = { ...current.local };
        if (conflict.id.startsWith("stroke:")) {
          const ink = normalizeInk(local.inkDocument);
          local.inkDocument = {
            ...ink,
            strokes: replaceStrokeGroup(ink.strokes, conflict.id.slice(7), value as StrokeChoice),
          };
        } else
          local[conflict.id as "className" | "content"] =
            (value as string) || "";
        const conflicts = current.conflicts.filter((c) => c.id !== conflict.id);
        return {
          ...current,
          local,
          conflicts,
          recoveryBase: conflicts.length ? current.recoveryBase : undefined,
          dirty: !sameNote(current.base, local),
          version: current.version + 1,
          changedAt: Date.now(),
          error: undefined,
        };
      });
      this.accept(savedRecord);
      this.changed(key);
      this.schedule();
    } catch (error) {
      this.storageFailure(error);
    }
  }
  private async receive(id: string, remote: LessonCurriculumWeek) {
    if (!isWeek(remote)) throw new Error("올바르지 않은 수업노트 응답입니다.");
    const key = noteKey(id, remote.week);
    if (this.busy(key)) return false;
    const savedRecord = await this.store.change(key, (current) => {
      if (
        current?.conflicts.length ||
        (current?.base && remote.revision <= current.base.revision)
      )
        return current;
      const result = current?.dirty
        ? mergeLessonNote(current.base, current.local, remote)
        : { merged: remote, conflicts: [] };
      return {
        key,
        id,
        base: remote,
        local: result.merged,
        version: (current?.version || 0) + 1,
        dirty: !sameNote(remote, result.merged),
        changedAt: current?.changedAt || 0,
        conflicts: result.conflicts,
        recoveryBase: result.conflicts.length ? current?.base : undefined,
      };
    });
    this.accept(savedRecord);
    return true;
  }
  private async download(summary: LessonCurriculumSummary) {
    const previous = this.snapshot.curricula.find((c) => c.id === summary.id);
    const complete =
      this.snapshot.notes.filter((n) => n.id === summary.id).length === 12;
    if (previous?.downloadedUpdatedAt === summary.updatedAt && complete) return;
    const detail = await api.lessonCurriculum(summary.id);
    if (
      !isSummary(detail) ||
      detail.id !== summary.id ||
      !Array.isArray(detail.weeks) ||
      detail.weeks.length !== 12 ||
      new Set(detail.weeks.map((w) => w.week)).size !== 12 ||
      detail.weeks.some(
        (w) =>
          !Number.isInteger(w.week) ||
          w.week < 1 ||
          w.week > 12 ||
          !Number.isInteger(w.revision) ||
          w.revision < 1
      )
    ) {
      throw new Error("올바르지 않은 12주 목록입니다.");
    }
    const metadata: LocalCurriculum = {
      id: summary.id,
      summary,
      detail,
      downloadedUpdatedAt: previous?.downloadedUpdatedAt,
    };
    await this.saveCurriculum(metadata);
    const pending = detail.weeks.filter((w) => {
      const record = this.snapshot.notes.find(
        (n) => n.key === noteKey(summary.id, w.week)
      );
      return !record?.base || record.base.revision < w.revision;
    });
    let applied = true;
    const worker = async () => {
      while (pending.length) {
        const week = pending.shift()!;
        const remote = await api.lessonCurriculumWeek(summary.id, week.week);
        if (remote.week !== week.week)
          throw new Error("요청한 주차와 응답이 다릅니다.");
        if (!(await this.receive(summary.id, remote))) applied = false;
      }
    };
    // Wait for all workers even on failure; never overlap the next cycle.
    const results = await Promise.allSettled([worker(), worker(), worker()]);
    const failed = results.find((r) => r.status === "rejected") as
      | PromiseRejectedResult
      | undefined;
    if (failed) {
      this.changed();
      throw failed.reason;
    }
    if (applied)
      await this.saveCurriculum({
        ...metadata,
        downloadedUpdatedAt: detail.updatedAt,
      });
    this.changed();
  }
  private async upload(key: string) {
    if (this.busy(key) || !(await this.store.claim(key, this.owner))) return;
    this.publish({ saving: [...this.snapshot.saving, key] });
    try {
      for (let attempt = 0; attempt <= 3; attempt++) {
        const sent = await this.store.getNote(key);
        this.accept(sent);
        if (
          !sent ||
          !sent.dirty ||
          sent.conflicts.length ||
          sent.error ||
          this.busy(key)
        )
          return;
        if (!sent.base) {
          await this.receive(
            sent.id,
            await api.lessonCurriculumWeek(sent.id, sent.local.week)
          );
          continue;
        }
        if (!(await this.store.claim(key, this.owner))) return;
        try {
          const saved = await api.updateLessonCurriculumWeek({
            ...sent.local,
            revision: sent.base.revision,
            id: sent.id,
          });
          if (!isWeek(saved) || saved.week !== sent.local.week)
            throw new Error("올바르지 않은 저장 응답입니다.");
          const savedRecord = await this.store.change(key, (current) => {
            if (!current) return;
            if (current.base && current.base.revision > saved.revision)
              return current;
            const local = {
              ...saved,
              className:
                current.local.className === sent.local.className
                  ? saved.className
                  : current.local.className,
              content:
                current.local.content === sent.local.content
                  ? saved.content
                  : current.local.content,
              inkDocument: equal(
                current.local.inkDocument,
                sent.local.inkDocument
              )
                ? saved.inkDocument
                : current.local.inkDocument,
            };
            return {
              ...current,
              base: saved,
              local,
              dirty: !sameNote(saved, local),
              version: current.version + 1,
            };
          });
          this.accept(savedRecord);
          return;
        } catch (error) {
          if (error instanceof ApiError && error.status === 409) {
            if (attempt === 3) {
              await this.store.change(
                key,
                (n) =>
                  n && {
                    ...n,
                    version: n.version + 1,
                    error:
                      "변경이 계속되고 있습니다. 저장 재시도를 눌러주세요.",
                  }
              );
              return;
            }
            await this.receive(
              sent.id,
              await api.lessonCurriculumWeek(sent.id, sent.local.week)
            );
          } else if (
            error instanceof ApiError &&
            error.status >= 400 &&
            error.status < 500 &&
            ![401, 403, 404, 429].includes(error.status)
          ) {
            const saveError = `저장 실패 (${error.status}): ${error.message}`;
            await this.store.change(
              key,
              (n) => n && { ...n, version: n.version + 1, error: saveError }
            );
            return;
          } else throw error;
        }
      }
    } finally {
      try {
        await this.store.release(key, this.owner);
        this.accept(await this.store.getNote(key));
        this.changed(key);
      } finally {
        this.publish({ saving: this.snapshot.saving.filter((k) => k !== key) });
      }
    }
  }
  refresh = (force = false): Promise<void> => {
    if (this.cycle)
      return force ? this.cycle.then(() => this.refresh(true)) : this.cycle;
    this.cycle = this.run(force).finally(() => {
      this.cycle = undefined;
    });
    return this.cycle;
  };
  private async run(force: boolean) {
    await this.hydrate();
    if (
      this.snapshot.storageError ||
      document.hidden ||
      (!force &&
        (Date.now() < this.retryAt || this.snapshot.connection === "auth"))
    )
      return;
    if (navigator.onLine === false) {
      this.offline();
      return;
    }
    this.publish({ fetching: true });
    try {
      const summaries = await api.lessonCurricula();
      if (
        !Array.isArray(summaries) ||
        !summaries.every(isSummary) ||
        new Set(summaries.map((s) => s.id)).size !== summaries.length
      ) {
        throw new Error("올바르지 않은 수업노트 목록입니다.");
      }
      this.publish({ connection: "online", error: "" });
      const ids = summaries.map((s) => s.id);
      if (
        this.snapshot.curricula.some(
          (c) => !ids.includes(c.id) && !c.deleted
        ) ||
        this.snapshot.notes.some(
          (n) =>
            !ids.includes(n.id) &&
            !this.snapshot.curricula.some((c) => c.id === n.id && c.deleted)
        )
      ) {
        await this.store.reconcile(ids);
        await this.reload();
        this.changed();
      }
      for (const summary of summaries) {
        const previous = this.snapshot.curricula.find(
          (c) => c.id === summary.id
        );
        if (!previous || previous.deleted || !equal(previous.summary, summary))
          await this.saveCurriculum({
            ...previous,
            id: summary.id,
            summary,
            deleted: false,
          });
      }
      let downloadError: unknown;
      for (const summary of summaries) {
        try {
          await this.download(summary);
        } catch (error) {
          if (
            error instanceof NoteStorageError ||
            (error instanceof ApiError && [401, 403].includes(error.status))
          )
            throw error;
          downloadError = error;
        }
      }
      for (const note of this.snapshot.notes) {
        if (
          note.dirty &&
          !note.conflicts.length &&
          !note.error &&
          Date.now() - note.changedAt >= 700 &&
          !this.snapshot.curricula.find((c) => c.id === note.id)?.deleted
        )
          await this.upload(note.key);
      }
      if (downloadError) throw downloadError;
      this.publish({ lastSynced: await this.store.synced() });
      this.failures = 0;
      this.retryAt = 0;
    } catch (error) {
      const auth =
        error instanceof ApiError && [401, 403].includes(error.status);
      const storage =
        error instanceof NoteStorageError ||
        (error instanceof DOMException &&
          ["QuotaExceededError", "UnknownError", "InvalidStateError"].includes(
            error.name
          ));
      if (storage) this.storageFailure(error);
      else
        this.publish({
          connection: auth
            ? "auth"
            : error instanceof TypeError ||
              (error instanceof Error && error.name === "AbortError")
            ? "offline"
            : "error",
          error: message(error),
        });
      this.retryAt =
        Date.now() + Math.min(30000, 1000 * 2 ** Math.min(this.failures++, 5));
    } finally {
      this.publish({ fetching: false });
    }
  }
  detail(id: string): LessonCurriculum | undefined {
    const item = this.snapshot.curricula.find((c) => c.id === id);
    if (!item) return;
    const records = this.snapshot.notes.filter((n) => n.id === id);
    if (!item.detail && !records.length) return;
    return {
      ...(item.detail || item.summary),
      weeks: (item.detail?.weeks || records.map((n) => n.local)).map((w) => {
        const record = records.find((n) => n.local.week === w.week);
        return record
          ? {
              ...record.local,
              hasInk: record.local.inkDocument.strokes.length > 0,
            }
          : w;
      }),
    };
  }
  async pendingWeeks(id: string) {
    const state = await this.store.read();
    return state.notes
      .filter(
        (n) =>
          n.id === id &&
          (n.dirty || n.conflicts.length || this.volatile.has(n.key))
      )
      .map((n) => n.local.week);
  }
  exportData(id?: string) {
    const notes = this.snapshot.notes
      .filter((n) => !id || n.id === id)
      .map((n) => ({
        ...n,
        local: this.volatile.get(n.key)?.local || n.local,
      }));
    const blob = new Blob(
      [
        JSON.stringify(
          {
            version: 1,
            exportedAt: new Date().toISOString(),
            curricula: this.snapshot.curricula.filter(
              (c) => !id || c.id === id
            ),
            notes,
          },
          null,
          2
        ),
      ],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = `lesson-notes-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
