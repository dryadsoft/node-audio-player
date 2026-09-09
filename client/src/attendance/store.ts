import { RecordPage, SavedCatalog, Term } from "./types";
const result = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () =>
      reject(tx.error || new Error("기기 저장이 취소됐습니다."));
    tx.onerror = () => reject(tx.error);
  });
export class AttendanceStore {
  private connection?: Promise<IDBDatabase>;
  constructor(private name = "node-audio-player-attendance") {}
  private db() {
    return (
      this.connection ||
      (this.connection = new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open(this.name, 1);
        let blocked = false;
        r.onupgradeneeded = () => {
          r.result.createObjectStore("pages", { keyPath: "id" });
          r.result.createObjectStore("photos");
          r.result.createObjectStore("catalogs");
          r.result.createObjectStore("settings");
        };
        r.onsuccess = () => {
          if (blocked) {
            r.result.close();
            return;
          }
          r.result.onversionchange = () => {
            r.result.close();
            this.connection = undefined;
          };
          resolve(r.result);
        };
        r.onerror = () => {
          this.connection = undefined;
          reject(r.error);
        };
        r.onblocked = () => {
          blocked = true;
          this.connection = undefined;
          reject(new Error("다른 탭을 닫고 다시 시도하세요."));
        };
      }))
    );
  }
  async hydrate() {
    const db = await this.db(),
      tx = db.transaction(["pages", "catalogs", "settings"]);
    const complete = done(tx);
    const [pages, catalogs, target, lastSync] = await Promise.all([
      result(tx.objectStore("pages").getAll()),
      result(tx.objectStore("catalogs").getAll()),
      result(tx.objectStore("settings").get("target")),
      result(tx.objectStore("settings").get("lastSync")),
    ]);
    await complete;
    return {
      pages: pages as RecordPage[],
      catalogs: catalogs as SavedCatalog[],
      target: target as Term | undefined,
      lastSync: lastSync as string | undefined,
    };
  }
  async mutate(
    id: string,
    change: (old?: RecordPage) => RecordPage | undefined,
    photo?: Blob
  ) {
    const db = await this.db(),
      tx = db.transaction(["pages", "photos"], "readwrite"),
      complete = done(tx);
    let value: RecordPage | undefined;
    const req = tx.objectStore("pages").get(id);
    req.onsuccess = () => {
      try {
        value = change(req.result);
        if (value) tx.objectStore("pages").put(value);
        if (photo) tx.objectStore("photos").put(photo, id);
      } catch {
        tx.abort();
      }
    };
    await complete;
    return value;
  }
  async photo(id: string) {
    const db = await this.db();
    return result<Blob | undefined>(
      db.transaction("photos").objectStore("photos").get(id)
    );
  }
  async catalog(key: string, value: SavedCatalog) {
    const db = await this.db(),
      tx = db.transaction("catalogs", "readwrite"),
      complete = done(tx);
    tx.objectStore("catalogs").put(value, key);
    await complete;
  }
  async syncedAt(value: string) {
    const db = await this.db(),
      tx = db.transaction("settings", "readwrite"),
      complete = done(tx);
    tx.objectStore("settings").put(value, "lastSync");
    await complete;
  }
  async target(value: Term) {
    const db = await this.db(),
      tx = db.transaction("settings", "readwrite"),
      complete = done(tx);
    tx.objectStore("settings").put(value, "target");
    await complete;
  }
}
