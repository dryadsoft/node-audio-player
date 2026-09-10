import { useEffect, useState } from "react";
import { api } from "../api";
import { InkDocumentV2 } from "../types";
import { attendanceApi, AttendanceError } from "./api";
import { AttendanceStore } from "./store";
import {
  Catalog,
  Page,
  RecordPage,
  SavedCatalog,
  Term,
  equal,
  isPeriodDeleted,
  mergeInk,
  termKey,
} from "./types";
export interface AttendanceState {
  pages: RecordPage[];
  catalogs: SavedCatalog[];
  target?: Term;
  hydrated: boolean;
  busy: boolean;
  online: boolean;
  auth: boolean;
  error: string;
  storageError: string;
  unsaved: number;
  lastSync?: string;
}
const empty: AttendanceState = {
  pages: [],
  catalogs: [],
  hydrated: false,
  busy: false,
  online: false,
  auth: false,
  error: "",
  storageError: "",
  unsaved: 0,
};
export class AttendanceWorkspace {
  private state: AttendanceState = { ...empty };
  private listeners = new Set<() => void>();
  private hydration?: Promise<void>;
  private running?: Promise<void>;
  private timer?: number;
  private refs = 0;
  private view?: Term;
  private wanted = new Set<string>();
  private channel?: BroadcastChannel;
  private failures = 0;
  private pending = new Map<
    string,
    { base: InkDocumentV2; ink: InkDocumentV2 }
  >();
  private writers = new Map<string, Promise<void>>();
  private blocked = new Set<string>();
  constructor(readonly store = new AttendanceStore()) {}
  getSnapshot = () => this.state;
  subscribe = (f: () => void) => {
    this.listeners.add(f);
    return () => {
      this.listeners.delete(f);
    };
  };
  private publish(patch: Partial<AttendanceState>) {
    this.state = { ...this.state, ...patch, unsaved: this.pending.size };
    this.listeners.forEach((f) => f());
  }
  private signal() {
    this.channel?.postMessage("changed");
    try {
      localStorage.setItem("attendance.changed", String(Date.now()));
    } catch {}
  }
  private accept(record?: RecordPage) {
    if (!record) return;
    const old = this.state.pages.find((p) => p.id === record.id);
    if (old && old.version > record.version) return;
    const pending = this.pending.get(record.id);
    const value = pending
      ? { ...record, local: { ...record.local, inkDocument: pending.ink } }
      : record;
    this.publish({
      pages: old
        ? this.state.pages.map((p) => (p.id === value.id ? value : p))
        : [...this.state.pages, value],
    });
  }
  hydrate = () =>
    this.hydration ||
    (this.hydration = this.store
      .hydrate()
      .then((data) => {
        this.publish({ ...data, hydrated: true });
      })
      .catch((e) => {
        this.hydration = undefined;
        this.storageFailure(e);
        this.publish({ hydrated: true });
      }));
  private storageFailure(e: unknown) {
    this.publish({
      storageError: `기기에 저장하지 못했습니다. ${
        e instanceof Error ? e.message : ""
      }`,
    });
  }
  private reload = async () => {
    try {
      const data = await this.store.hydrate();
      data.pages.forEach((p) => this.accept(p));
      this.publish({ catalogs: data.catalogs, target: data.target });
    } catch (e) {
      this.storageFailure(e);
    }
  };
  private beforeUnload = (e: BeforeUnloadEvent) => {
    if (this.pending.size) {
      e.preventDefault();
      e.returnValue = "";
    }
  };
  private onStorage = (e: StorageEvent) => {
    if (e.key === "attendance.changed") void this.reload();
  };
  private onFocus = () => {
    if (document.visibilityState !== "hidden") void this.sync();
  };
  start() {
    if (++this.refs === 1) {
      void navigator.storage?.persist?.().catch(() => undefined);
      void this.hydrate().then(() => this.sync());
      if (typeof BroadcastChannel !== "undefined") {
        this.channel = new BroadcastChannel("attendance");
        this.channel.onmessage = () => void this.reload();
      }
      window.addEventListener("online", this.onFocus);
      window.addEventListener("focus", this.onFocus);
      document.addEventListener("visibilitychange", this.onFocus);
      window.addEventListener("beforeunload", this.beforeUnload);
      window.addEventListener("storage", this.onStorage);
    }
    return () => {
      if (--this.refs === 0) {
        window.clearTimeout(this.timer);
        this.channel?.close();
        this.channel = undefined;
        window.removeEventListener("online", this.onFocus);
        window.removeEventListener("focus", this.onFocus);
        document.removeEventListener("visibilitychange", this.onFocus);
        window.removeEventListener("beforeunload", this.beforeUnload);
        window.removeEventListener("storage", this.onStorage);
      }
    };
  }
  setView(t: Term) {
    this.view = t;
    void this.sync();
  }
  want(id: string) {
    this.wanted.add(id);
    void this.sync();
  }
  async setTarget(t: Term) {
    try {
      await this.store.target(t);
      this.publish({ target: t });
      this.signal();
      void this.sync();
    } catch (e) {
      this.storageFailure(e);
    }
  }
  async add(
    t: Term,
    periodId: string,
    blob: Blob,
    width: number,
    height: number
  ) {
    if (
      isPeriodDeleted(
        this.state.catalogs.find((c) => termKey(c.semester) === termKey(t)),
        periodId
      )
    )
      throw new Error("휴지통 기록입니다. 센터와 교시를 먼저 복구하세요.");
    const id = crypto.randomUUID();
    const local: Page = {
      id,
      periodId,
      imageHash: "",
      width,
      height,
      position: Date.now(),
      revision: 0,
      deletedAt: null,
      updatedAt: new Date().toISOString(),
      inkDocument: {
        version: 2,
        pageCount: 1,
        aspectRatio: width / height,
        strokes: [],
      },
    };
    try {
      const saved = await this.store.mutate(
        id,
        () => ({
          id,
          semester: t,
          local,
          dirty: true,
          version: 1,
          conflicts: [],
          photoReady: true,
        }),
        blob
      );
      this.accept(saved);
      this.publish({ storageError: "" });
      this.wanted.add(id);
      this.signal();
      void this.sync();
      return id;
    } catch (e) {
      this.storageFailure(e);
      throw e;
    }
  }
  edit(id: string, ink: InkDocumentV2) {
    const record = this.state.pages.find((p) => p.id === id);
    if (
      !record ||
      record.local.deletedAt ||
      record.remoteDeleted ||
      isPeriodDeleted(
        this.state.catalogs.find(
          (c) => termKey(c.semester) === termKey(record.semester)
        ),
        record.local.periodId
      )
    )
      return;
    const old = this.pending.get(id);
    this.pending.set(id, { base: old?.base || record.local.inkDocument, ink });
    this.publish({
      pages: this.state.pages.map((p) =>
        p.id === id
          ? { ...p, local: { ...p.local, inkDocument: ink }, dirty: true }
          : p
      ),
    });
    void this.flush(id);
  }
  private flush(id: string): Promise<void> {
    const existing = this.writers.get(id);
    if (existing) return existing;
    const work = (async () => {
      while (this.pending.has(id)) {
        const input = this.pending.get(id)!;
        try {
          const result = await this.store.mutate(id, (record) => {
            if (!record) throw new Error("출석부 기록이 없습니다.");
            const merged = mergeInk(
              input.base,
              input.ink,
              record.local.inkDocument
            );
            return {
              ...record,
              local: { ...record.local, inkDocument: merged.ink },
              dirty: true,
              version: record.version + 1,
              conflicts: [
                ...record.conflicts.filter(
                  (c) => !merged.conflicts.some((n) => n.id === c.id)
                ),
                ...merged.conflicts,
              ],
              error: undefined,
            };
          });
          const latest = this.pending.get(id);
          if (latest === input) this.pending.delete(id);
          else if (latest && result) {
            const remaining = mergeInk(
              input.ink,
              latest.ink,
              result.local.inkDocument
            );
            this.pending.set(id, {
              base: result.local.inkDocument,
              ink: remaining.ink,
            });
          }
          this.accept(result);
          this.publish({ storageError: "" });
          this.signal();
        } catch (e) {
          this.storageFailure(e);
          break;
        }
      }
    })().finally(() => {
      this.writers.delete(id);
      this.schedule(700);
    });
    this.writers.set(id, work);
    return work;
  }
  private schedule(delay: number) {
    if (!this.refs) return;
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      if (document.visibilityState === "hidden") this.schedule(5000);
      else void this.sync();
    }, delay);
  }
  async refresh() {
    if (this.running) await this.running;
    await this.sync();
  }
  async retry() {
    this.blocked.clear();
    await this.hydrate();
    await Promise.all(
      Array.from(this.pending.keys()).map((id) => this.flush(id))
    );
    return this.sync();
  }
  async resolve(id: string, conflictId: string, side: "local" | "server") {
    if (this.pending.has(id)) return;
    try {
      const saved = await this.store.mutate(id, (r) => {
        if (!r) return;
        const c = r.conflicts.find((c) => c.id === conflictId);
        if (!c) return r;
        const strokes = r.local.inkDocument.strokes.filter(
          (s) => s.id !== c.id
        );
        if (c[side]) strokes.push(c[side]!);
        return {
          ...r,
          local: {
            ...r.local,
            inkDocument: { ...r.local.inkDocument, strokes },
          },
          conflicts: r.conflicts.filter((c) => c.id !== conflictId),
          historyKey: (r.historyKey || 0) + 1,
          dirty: true,
          version: r.version + 1,
        };
      });
      this.accept(saved);
      this.signal();
      void this.sync();
    } catch (e) {
      this.storageFailure(e);
    }
  }
  private async receive(
    remote: Page,
    t: Term,
    blob?: Blob,
    periodDeleted = false
  ) {
    const wasDeleted = this.state.pages.find(
      (p) => p.id === remote.id
    )?.remoteDeleted;
    const result = await this.store
      .mutate(
        remote.id,
        (old) => {
          const recovery = !!(remote.deletedAt || periodDeleted);
          if (old?.dirty) {
            if (recovery)
              return {
                ...old,
                remoteDeleted: true,
                version: old.version + 1,
                error:
                  "서버에서 삭제된 기록입니다. 휴지통에서 복구한 뒤 전송하세요.",
              };
            const merged = mergeInk(
              old.base?.inkDocument,
              old.local.inkDocument,
              remote.inkDocument
            );
            // Preserve unresolved choices through repeated identical server reads.
            const conflicts =
              old.base?.revision === remote.revision
                ? old.conflicts
                : merged.conflicts;
            return {
              ...old,
              base: remote,
              local: { ...remote, inkDocument: merged.ink },
              dirty:
                conflicts.length > 0 || !equal(merged.ink, remote.inkDocument),
              conflicts,
              photoReady: old.photoReady || !!blob,
              remoteDeleted: false,
              error: undefined,
              historyKey:
                (old.historyKey || 0) +
                (equal(old.local.inkDocument, merged.ink) ? 0 : 1),
              version: old.version + 1,
            };
          }
          return {
            id: remote.id,
            semester: t,
            local: remote,
            base: remote,
            dirty: false,
            version: (old?.version || 0) + 1,
            conflicts: [],
            photoReady: !!blob || !!old?.photoReady,
            remoteDeleted: recovery,
            historyKey:
              (old?.historyKey || 0) +
              (old && !equal(old.local.inkDocument, remote.inkDocument)
                ? 1
                : 0),
          };
        },
        blob
      )
      .catch((error) => {
        this.storageFailure(error);
        throw error;
      });
    if (wasDeleted && result && !result.remoteDeleted)
      this.blocked.delete(remote.id);
    this.accept(result);
    this.signal();
  }
  private async send(id: string) {
    for (let attempt = 0; attempt < 4; attempt++) {
      let r = this.state.pages.find((p) => p.id === id);
      if (
        !r ||
        !r.dirty ||
        r.conflicts.length ||
        r.remoteDeleted ||
        this.pending.has(id) ||
        this.blocked.has(id)
      )
        return;
      try {
        if (!r.base) {
          const blob = await this.store.photo(id);
          if (!blob) throw new Error("기기 사진이 없습니다.");
          const created = await attendanceApi.upload(
            id,
            r.local.periodId,
            blob
          );
          await this.receive(created, r.semester);
          r = this.state.pages.find((p) => p.id === id)!;
          if (!r.dirty) return;
        }
        const sent = r.local.inkDocument,
          revision = r.base!.revision;
        const remote = await attendanceApi.changePage(id, {
          expectedRevision: revision,
          inkDocument: sent,
        });
        // Server acknowledged this exact input; later edits are not overwritten.
        const saved = await this.store.mutate(id, (current) => {
          if (!current) return;
          const merged = mergeInk(
            sent,
            current.local.inkDocument,
            remote.inkDocument
          );
          return {
            ...current,
            base: remote,
            local: { ...remote, inkDocument: merged.ink },
            dirty:
              !equal(merged.ink, remote.inkDocument) ||
              current.conflicts.length > 0,
            version: current.version + 1,
            error: undefined,
          };
        });
        this.accept(saved);
        this.signal();
        return;
      } catch (e) {
        if (e instanceof AttendanceError && e.status === 409) {
          // A parent may have been trashed after this cycle's snapshot.
          // Keep the local draft and retry only after the parent is restored.
          const catalog = await attendanceApi
            .snapshot(r.semester)
            .catch(() => undefined);
          if (isPeriodDeleted(catalog, r.local.periodId)) {
            const saved = await this.store.mutate(id, (current) =>
              current
                ? {
                    ...current,
                    remoteDeleted: true,
                    version: current.version + 1,
                  }
                : undefined
            );
            this.accept(saved);
            return;
          }
          const remote = await attendanceApi.page(id).catch(() => undefined);
          if (remote) {
            await this.receive(remote, r.semester);
            if (remote.deletedAt) return;
          }
          if (attempt < 3) continue;
          this.blocked.add(id);
        } else if (
          e instanceof AttendanceError &&
          e.status >= 400 &&
          e.status < 500 &&
          e.status !== 401
        )
          this.blocked.add(id);
        const saved = await this.store.mutate(id, (current) =>
          current
            ? {
                ...current,
                error: e instanceof Error ? e.message : "전송 실패",
                version: current.version + 1,
              }
            : undefined
        );
        this.accept(saved);
        throw e;
      }
    }
  }
  sync = (): Promise<void> => {
    if (this.running) return this.running;
    this.running = (async () => {
      await this.hydrate();
      this.publish({ busy: true });
      try {
        const cycleErrors: unknown[] = [];
        const selections = new Map<string, Term>();
        if (this.state.target)
          selections.set(termKey(this.state.target), this.state.target);
        if (this.view) selections.set(termKey(this.view), this.view);
        this.state.pages
          .filter((p) => p.dirty)
          .forEach((p) => selections.set(termKey(p.semester), p.semester));
        if (!selections.size) return;
        let locations:
          | Awaited<ReturnType<typeof api.lessonLocations>>
          | undefined;
        for (const t of Array.from(selections.values())) {
          const catalog: Catalog = await attendanceApi.snapshot(t);
          if (!locations) locations = await api.lessonLocations();
          const saved = { ...catalog, semester: t, locations };
          await this.store.catalog(termKey(t), saved).catch((error) => {
            this.storageFailure(error);
            throw error;
          });
          this.publish({
            catalogs: [
              ...this.state.catalogs.filter(
                (c) => termKey(c.semester) !== termKey(t)
              ),
              saved,
            ],
            online: true,
            auth: false,
          });
          const queue = catalog.pages.filter((p) => {
            const old = this.state.pages.find((r) => r.id === p.id);
            return (
              old?.dirty ||
              this.wanted.has(p.id) ||
              (this.state.target &&
                termKey(this.state.target) === termKey(t) &&
                !p.deletedAt &&
                !isPeriodDeleted(catalog, p.periodId))
            );
          });
          let cursor = 0;
          const download = async () => {
            while (cursor < queue.length) {
              const meta = queue[cursor++],
                old = this.state.pages.find((p) => p.id === meta.id),
                parentDeleted = isPeriodDeleted(catalog, meta.periodId);
              if (
                !old ||
                old.base?.revision !== meta.revision ||
                !old.photoReady ||
                old.remoteDeleted !== !!(meta.deletedAt || parentDeleted)
              ) {
                try {
                  const page = await attendanceApi.page(meta.id),
                    blob = old?.photoReady
                      ? undefined
                      : await attendanceApi.photo(meta.id);
                  await this.receive(page, t, blob, parentDeleted);
                } catch (error) {
                  cycleErrors.push(error);
                }
              }
            }
          };
          await Promise.all([download(), download()]);
          // Mark local-only uploads whose parent was deleted elsewhere as recovery records.
          for (const old of this.state.pages.filter(
            (p) => p.dirty && termKey(p.semester) === termKey(t)
          )) {
            const deleted =
              isPeriodDeleted(catalog, old.local.periodId) ||
              !!catalog.pages.find((p) => p.id === old.id)?.deletedAt;
            if (deleted !== !!old.remoteDeleted && !old.local.deletedAt) {
              if (!deleted) this.blocked.delete(old.id);
              const updated = await this.store.mutate(old.id, (r) =>
                r
                  ? { ...r, remoteDeleted: deleted, version: r.version + 1 }
                  : undefined
              );
              this.accept(updated);
            }
          }
        }
        for (const r of this.state.pages.filter((p) => p.dirty)) {
          try {
            await this.send(r.id);
          } catch (e) {
            cycleErrors.push(e);
          }
        }
        this.failures = cycleErrors.length ? this.failures + 1 : 0;
        const failure = cycleErrors[0];
        const lastSync = new Date().toISOString();
        await this.store.syncedAt(lastSync).catch((error) => {
          this.storageFailure(error);
          throw error;
        });
        this.publish({
          online: !cycleErrors.some(
            (e) =>
              e instanceof AttendanceError &&
              (e.status === 0 || e.status === 401)
          ),
          auth: cycleErrors.some(
            (e) => e instanceof AttendanceError && e.status === 401
          ),
          error: failure instanceof Error ? failure.message : "",
          storageError:
            !cycleErrors.length && !this.pending.size
              ? ""
              : this.state.storageError,
          lastSync,
        });
        this.signal();
      } catch (e) {
        this.failures++;
        this.publish({
          online: false,
          auth: e instanceof AttendanceError && e.status === 401,
          error: e instanceof Error ? e.message : "연결 실패",
        });
      } finally {
        this.publish({ busy: false });
        this.schedule(Math.min(30000, 5000 * Math.pow(2, this.failures)));
      }
    })().finally(() => {
      this.running = undefined;
    });
    return this.running;
  };
}
export const attendanceWorkspace = new AttendanceWorkspace();
export function useAttendance() {
  const [state, setState] = useState(attendanceWorkspace.getSnapshot);
  useEffect(
    () =>
      attendanceWorkspace.subscribe(() =>
        setState(attendanceWorkspace.getSnapshot())
      ),
    []
  );
  return { ...state, workspace: attendanceWorkspace };
}
export function AttendanceLifecycle() {
  useEffect(() => attendanceWorkspace.start(), []);
  return null;
}
