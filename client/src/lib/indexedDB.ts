import { PendingRecording } from '@shared/schema';

export interface LocalRecording {
  id: string;
  audioBlob: Blob;
  duration: number;
  status: 'queued' | 'uploading' | 'uploaded' | 'failed';
  createdAt: Date;
  serverRecordingId?: string;
  title?: string;
  transcript?: string;
  summary?: string;
}

const DB_NAME = 'audio-notes-db';
const DB_VERSION = 1;
const STORE_NAME = 'pending-recordings';

class IndexedDBManager {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
    });
  }

  async addRecording(recording: LocalRecording): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.add(recording);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAllRecordings(): Promise<LocalRecording[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async updateRecording(id: string, updates: Partial<LocalRecording>): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const recording = getRequest.result;
        if (recording) {
          const updatedRecording = { ...recording, ...updates };
          const putRequest = store.put(updatedRecording);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(putRequest.error);
        } else {
          reject(new Error('Recording not found'));
        }
      };

      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async deleteRecording(id: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clear(): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

export const indexedDB = new IndexedDBManager();

// Initialize on import
if (typeof window !== 'undefined') {
  indexedDB.init().catch(console.error);
}