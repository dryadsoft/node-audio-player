import { LessonCurriculumWeek } from "../types";

const DATABASE_NAME = "node-audio-player-drafts";
const STORE_NAME = "lesson-note-weeks";

const openDatabase = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const transact = async <T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>
) => {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = action(transaction.objectStore(STORE_NAME));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
};

export const lessonNoteDraftKey = (curriculumId: string, week: number) =>
  `${curriculumId}:${week}`;

export interface NoteDraftRecord {
  base?: LessonCurriculumWeek;
  local: LessonCurriculumWeek;
}
const clean = (value: LessonCurriculumWeek): LessonCurriculumWeek => {
  const { lessonPlan, materials, ...note } = value as LessonCurriculumWeek & {
    lessonPlan?: unknown;
    materials?: unknown;
  };
  return note;
};
export const loadLessonNoteDraft = async (
  key: string
): Promise<NoteDraftRecord | undefined> => {
  await queues.get(key)?.catch(() => undefined);
  const value = await transact<
    NoteDraftRecord | LessonCurriculumWeek | undefined
  >("readonly", (store) => store.get(key));
  if (!value) return undefined;
  return "local" in value
    ? { base: value.base && clean(value.base), local: clean(value.local) }
    : { local: clean(value) };
};
const queues = new Map<string, Promise<unknown>>();
const ordered = <T>(key: string, action: () => Promise<T>) => {
  const task = (queues.get(key) || Promise.resolve())
    .catch(() => undefined)
    .then(action);
  queues.set(key, task);
  task
    .finally(() => {
      if (queues.get(key) === task) queues.delete(key);
    })
    .catch(() => undefined);
  return task;
};
export const saveLessonNoteDraft = (
  key: string,
  local: LessonCurriculumWeek,
  base?: LessonCurriculumWeek
) =>
  ordered(key, () =>
    transact<IDBValidKey>("readwrite", (store) =>
      store.put({ base, local }, key)
    )
  );
export const clearLessonNoteDraft = (key: string) =>
  ordered(key, () =>
    transact<undefined>("readwrite", (store) => store.delete(key))
  );
