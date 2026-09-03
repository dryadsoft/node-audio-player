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
  action: (store: IDBObjectStore) => IDBRequest<T>,
) => {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = action(database.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
};

export const lessonNoteDraftKey = (curriculumId: string, week: number) =>
  `${curriculumId}:${week}`;

export const loadLessonNoteDraft = (key: string) =>
  transact<LessonCurriculumWeek | undefined>("readonly", (store) => store.get(key));

export const saveLessonNoteDraft = (
  key: string,
  value: LessonCurriculumWeek,
) => transact<IDBValidKey>("readwrite", (store) => store.put(value, key));

export const clearLessonNoteDraft = (key: string) =>
  transact<undefined>("readwrite", (store) => store.delete(key));
