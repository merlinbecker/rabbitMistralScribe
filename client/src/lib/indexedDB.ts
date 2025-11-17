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

    console.log('[IndexedDB] ➕ Adding new recording');
    console.log('[IndexedDB]   ID:', recording.id);
    console.log('[IndexedDB]   Status:', recording.status);
    console.log('[IndexedDB]   Duration:', recording.duration, 's');
    console.log('[IndexedDB]   Blob size:', recording.audioBlob.size, 'bytes');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.add(recording);

      request.onsuccess = () => {
        console.log('[IndexedDB] ✅ Recording added successfully');
        resolve();
      };
      request.onerror = () => {
        console.error('[IndexedDB] ❌ Failed to add recording:', request.error);
        reject(request.error);
      };
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

    console.log('[IndexedDB] 🔄 Updating recording');
    console.log('[IndexedDB]   ID:', id);
    console.log('[IndexedDB]   Updates:', JSON.stringify(updates, null, 2));

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const recording = getRequest.result;
        if (recording) {
          const oldStatus = recording.status;
          const updatedRecording = { ...recording, ...updates };
          const putRequest = store.put(updatedRecording);
          putRequest.onsuccess = () => {
            console.log('[IndexedDB] ✅ Recording updated');
            if (updates.status && oldStatus !== updates.status) {
              console.log('[IndexedDB]   Status changed:', oldStatus, '→', updates.status);
            }
            resolve();
          };
          putRequest.onerror = () => {
            console.error('[IndexedDB] ❌ Failed to update recording:', putRequest.error);
            reject(putRequest.error);
          };
        } else {
          console.error('[IndexedDB] ❌ Recording not found:', id);
          reject(new Error('Recording not found'));
        }
      };

      getRequest.onerror = () => {
        console.error('[IndexedDB] ❌ Failed to get recording:', getRequest.error);
        reject(getRequest.error);
      };
    });
  }

  async deleteRecording(id: string): Promise<void> {
    if (!this.db) await this.init();

    console.log('[IndexedDB] 🗑️ Deleting recording');
    console.log('[IndexedDB]   ID:', id);

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => {
        console.log('[IndexedDB] ✅ Recording deleted successfully');
        resolve();
      };
      request.onerror = () => {
        console.error('[IndexedDB] ❌ Failed to delete recording:', request.error);
        reject(request.error);
      };
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