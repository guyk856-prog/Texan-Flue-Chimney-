const DB = "texan-private-drafts-v1";
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      for (const name of ["drafts", "photos"])
        if (!req.result.objectStoreNames.contains(name))
          req.result.createObjectStore(name, { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export async function localGet<T>(
  store: "drafts" | "photos",
  key: string,
): Promise<T | undefined> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const r = db.transaction(store).objectStore(store).get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}
export async function localPut(
  store: "drafts" | "photos",
  value: { key: string; [k: string]: unknown },
) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).put(value);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function localDelete(store: "drafts" | "photos", key: string) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function localList<T extends { key: string }>(
  store: "drafts" | "photos",
  prefix: string,
): Promise<T[]> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const r = db.transaction(store).objectStore(store).getAll();
      r.onsuccess = () =>
        resolve(r.result.filter((v) => v.key.startsWith(prefix)));
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}
