import {
  LessonCurriculum,
  LessonCurriculumSummary,
  LessonCurriculumWeek,
} from "../types";
import { NoteConflict } from "../api/mergeLessonNote";

export interface LocalNote {
  key: string;
  id: string;
  base?: LessonCurriculumWeek;
  local: LessonCurriculumWeek;
  version: number;
  dirty: boolean;
  changedAt: number;
  conflicts: NoteConflict[];
  recoveryBase?: LessonCurriculumWeek;
  error?: string;
}
export interface LocalCurriculum {
  id: string;
  summary: LessonCurriculumSummary;
  detail?: LessonCurriculum;
  downloadedUpdatedAt?: string;
  deleted?: boolean;
}
export interface StoredNotes {
  notes: LocalNote[];
  curricula: LocalCurriculum[];
  lastSynced?: string;
}
export class NoteStorageError extends Error {}
export const noteKey = (id: string, week: number) => `${id}:${week}`;
const clean = (note: LessonCurriculumWeek): LessonCurriculumWeek => {
  const { lessonPlan, materials, ...rest } = note as LessonCurriculumWeek & {
    lessonPlan?: unknown;
    materials?: unknown;
  };
  return rest;
};

/** The legacy store remains intact. Upgrade copies drafts atomically, once. */
export class NoteStore {
  private connection?: Promise<IDBDatabase>;
  constructor(private name = "node-audio-player-drafts") {}
  private open() {
    if (!this.connection)
      this.connection = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(this.name, 2);
        let blocked = false;
        request.onblocked = () => {
          blocked = true;
          reject(new Error("다른 탭을 닫고 저장을 다시 시도하세요."));
        };
        request.onerror = () => reject(request.error);
        request.onupgradeneeded = () => {
          const db = request.result;
          const notes = db.createObjectStore("notes", { keyPath: "key" });
          db.createObjectStore("curricula", { keyPath: "id" });
          db.createObjectStore("state");
          if (db.objectStoreNames.contains("lesson-note-weeks")) {
            const cursor = request
              .transaction!.objectStore("lesson-note-weeks")
              .openCursor();
            cursor.onsuccess = () => {
              const item = cursor.result;
              if (!item) return;
              const key = String(item.key);
              const value = item.value;
              const local = clean("local" in value ? value.local : value);
              notes.put({
                key,
                id: key.slice(0, key.lastIndexOf(":")),
                local,
                base: value.base && clean(value.base),
                version: 1,
                dirty: true,
                changedAt: Date.now(),
                conflicts: [],
              } as LocalNote);
              item.continue();
            };
          }
        };
        request.onsuccess = () => {
          const db = request.result;
          if (blocked) {
            db.close();
            return;
          }
          db.onversionchange = () => {
            db.close();
            this.connection = undefined;
          };
          resolve(db);
        };
      }).catch((error) => {
        this.connection = undefined;
        throw error;
      });
    return this.connection;
  }
  private async transaction<T>(
    stores: string[],
    mode: IDBTransactionMode,
    run: (tx: IDBTransaction, result: (value: T) => void) => void
  ): Promise<T> {
    return this.open()
      .then(
        (db) =>
          new Promise<T>((resolve, reject) => {
            const tx = db.transaction(stores, mode);
            let value: T;
            tx.oncomplete = () => resolve(value);
            tx.onabort = () =>
              reject(tx.error || new Error("기기 저장이 중단되었습니다."));
            tx.onerror = () => reject(tx.error);
            try {
              run(tx, (result) => {
                value = result;
              });
            } catch (error) {
              tx.abort();
              reject(error);
            }
          })
      )
      .catch((error) => {
        throw new NoteStorageError(
          error instanceof Error ? error.message : "기기 저장에 실패했습니다."
        );
      });
  }
  async read(): Promise<StoredNotes> {
    return this.transaction(
      ["notes", "curricula", "state"],
      "readonly",
      (tx, result) => {
        const value: StoredNotes = { notes: [], curricula: [] };
        tx.objectStore("notes").getAll().onsuccess = (e) => {
          value.notes = (e.target as IDBRequest).result;
        };
        tx.objectStore("curricula").getAll().onsuccess = (e) => {
          value.curricula = (e.target as IDBRequest).result;
        };
        tx.objectStore("state").get("lastSynced").onsuccess = (e) => {
          value.lastSynced = (e.target as IDBRequest).result;
        };
        result(value);
      }
    );
  }
  async getNote(key: string) {
    return this.transaction<LocalNote | undefined>(
      ["notes"],
      "readonly",
      (tx, result) => {
        tx.objectStore("notes").get(key).onsuccess = (e) =>
          result((e.target as IDBRequest).result);
      }
    );
  }
  async change(
    key: string,
    update: (current?: LocalNote) => LocalNote | undefined
  ) {
    return this.transaction<LocalNote | undefined>(
      ["notes"],
      "readwrite",
      (tx, result) => {
        const store = tx.objectStore("notes");
        store.get(key).onsuccess = (e) => {
          const current = (e.target as IDBRequest).result as
            | LocalNote
            | undefined;
          try {
            const next = update(current);
            if (next && next !== current) store.put(next);
            result(next);
          } catch {
            tx.abort();
          }
        };
      }
    );
  }
  async putCurriculum(value: LocalCurriculum) {
    return this.transaction(["curricula"], "readwrite", (tx) => {
      tx.objectStore("curricula").put(value);
    });
  }
  async reconcile(ids: string[]) {
    return this.transaction(["curricula", "notes"], "readwrite", (tx) => {
      const ns = tx.objectStore("notes"),
        cs = tx.objectStore("curricula");
      ns.getAll().onsuccess = (e) => {
        const notes = (e.target as IDBRequest).result as LocalNote[];
        cs.getAll().onsuccess = (e2) => {
          const curricula = (e2.target as IDBRequest)
            .result as LocalCurriculum[];
          const missing = new Set(
            [...curricula.map((c) => c.id), ...notes.map((n) => n.id)].filter(
              (id) => !ids.includes(id)
            )
          );
          missing.forEach((id) => {
            const children = notes.filter((n) => n.id === id);
            if (children.some((n) => n.dirty || n.conflicts.length)) {
              const previous = curricula.find((c) => c.id === id);
              cs.put({
                ...(previous || {
                  id,
                  summary: {
                    id,
                    year: 0,
                    term: "spring",
                    programName: "이전 임시 기록",
                    completedWeeks: 0,
                    linkedPlanCount: 0,
                    createdAt: "",
                    updatedAt: "",
                  },
                }),
                deleted: true,
              });
            } else {
              cs.delete(id);
              children.forEach((n) => ns.delete(n.key));
            }
          });
        };
      };
    });
  }
  async synced() {
    const now = new Date().toISOString();
    await this.transaction(["state"], "readwrite", (tx) => {
      tx.objectStore("state").put(now, "lastSynced");
    });
    return now;
  }
  async claim(key: string, owner: string) {
    return this.transaction<boolean>(["state"], "readwrite", (tx, result) => {
      const store = tx.objectStore("state");
      store.get(`lease:${key}`).onsuccess = (e) => {
        const lease = (e.target as IDBRequest).result;
        const allowed =
          !lease || lease.owner === owner || lease.until < Date.now();
        if (allowed)
          store.put({ owner, until: Date.now() + 30000 }, `lease:${key}`);
        result(allowed);
      };
    });
  }
  async release(key: string, owner: string) {
    return this.transaction(["state"], "readwrite", (tx) => {
      const store = tx.objectStore("state");
      store.get(`lease:${key}`).onsuccess = (e) => {
        if ((e.target as IDBRequest).result?.owner === owner)
          store.delete(`lease:${key}`);
      };
    });
  }
  async close() {
    (await this.connection)?.close();
    this.connection = undefined;
  }
}
