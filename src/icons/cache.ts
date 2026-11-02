import type { IconRecord } from './policy';
export interface IconAsset {
  key: string;
  blob: Blob;
  updatedAt: number;
}
let database: Promise<IDBDatabase> | undefined;
function db(): Promise<IDBDatabase> {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('orbit-icons', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('pages', { keyPath: 'key' });
      request.result.createObjectStore('assets', { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      database = undefined;
      reject(request.error);
    };
  });
  return database;
}
async function read<T>(store: string, key: string): Promise<T | undefined> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const request = database.transaction(store).objectStore(store).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}
export const readIconRecord = (key: string) => read<IconRecord>('pages', key);
export const readIconAsset = (key: string) => read<IconAsset>('assets', key);
export async function invalidateIconAsset(key: string): Promise<void> {
  const database = await db();
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction('assets', 'readwrite');
    tx.objectStore('assets').delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
export async function writeIcon(
  record: IconRecord,
  blob?: Blob,
): Promise<void> {
  const database = await db();
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction(['pages', 'assets'], 'readwrite');
    tx.objectStore('pages').put(record);
    if (blob && record.asset)
      tx.objectStore('assets').put({
        key: record.asset,
        blob,
        updatedAt: record.updatedAt,
      });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
/** Cap persistent use at 64 MB / 1024 assets and 4000 pages, remove broken references. */
export async function pruneIcons(): Promise<void> {
  const database = await db();
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction(['pages', 'assets'], 'readwrite');
    const assets = tx.objectStore('assets'),
      pages = tx.objectStore('pages');
    const request = assets.getAll();
    request.onsuccess = () => {
      const all = (request.result as IconAsset[]).sort(
        (a, b) => b.updatedAt - a.updatedAt,
      );
      let bytes = 0;
      const kept = new Set<string>();
      all.forEach((asset, i) => {
        bytes += asset.blob.size;
        if (i >= 1024 || bytes > 64 * 1024 * 1024) assets.delete(asset.key);
        else kept.add(asset.key);
      });
      const records = pages.getAll();
      records.onsuccess = () =>
        (records.result as IconRecord[])
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .forEach((r, i) => {
            if (
              i >= 4000 ||
              (r.asset && !kept.has(r.asset)) ||
              (!r.asset && r.expiresAt < Date.now())
            )
              pages.delete(r.key);
          });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
