import { parseProject, type MapProject } from "@mapscribe/core";

const STORAGE_VERSION = 1;
const DRAFT_KEY = "draft";

export interface KeyValueStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

interface StoredDraft {
  storageVersion: number;
  project: unknown;
}

export function createMemoryStore(): KeyValueStore {
  const values = new Map<string, unknown>();
  return {
    async get(key) {
      return values.get(key);
    },
    async set(key, value) {
      values.set(key, value);
    },
    async delete(key) {
      values.delete(key);
    },
  };
}

export async function saveDraft(store: KeyValueStore, project: MapProject): Promise<void> {
  const payload: StoredDraft = { storageVersion: STORAGE_VERSION, project };
  await store.set(DRAFT_KEY, payload);
}

export async function loadDraft(store: KeyValueStore): Promise<MapProject | null> {
  const payload = await store.get(DRAFT_KEY);
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Partial<StoredDraft>;
  if (record.storageVersion !== STORAGE_VERSION || record.project === undefined) return null;
  return parseProject(record.project).project;
}

export async function clearDraft(store: KeyValueStore): Promise<void> {
  await store.delete(DRAFT_KEY);
}

export function createBrowserStore(): KeyValueStore {
  return {
    async get(key) {
      try {
        return await idbGet(key);
      } catch {
        const raw = localStorage.getItem(`mapscribe.${key}`);
        return raw ? (JSON.parse(raw) as unknown) : undefined;
      }
    },
    async set(key, value) {
      try {
        await idbSet(key, value);
      } catch {
        localStorage.setItem(`mapscribe.${key}`, JSON.stringify(value));
      }
    },
    async delete(key) {
      try {
        await idbDelete(key);
      } catch {
        localStorage.removeItem(`mapscribe.${key}`);
      }
    },
  };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("mapscribe", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法打开本地数据库"));
  });
}

async function idbGet(key: string): Promise<unknown> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readonly");
    const request = tx.objectStore("kv").get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
