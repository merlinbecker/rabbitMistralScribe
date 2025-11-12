import Database from "@replit/database";

/**
 * DatabaseService provides a centralized interface to the Replit Database
 * with automatic data unwrapping, serialization, and error handling.
 * 
 * This service abstracts away the complexity of Replit DB's response wrapping
 * behavior and provides a clean, type-safe interface for all database operations.
 */
export class DatabaseService {
  private db: Database;

  constructor(db?: Database) {
    this.db = db || new Database();
  }

  /**
   * Get a value from the database with automatic unwrapping and parsing.
   * Returns undefined if the key doesn't exist or if there's an error.
   */
  async get<T>(key: string): Promise<T | undefined> {
    try {
      const rawData = await this.db.get(key);

      // Check if data exists and is not an error object from Replit DB
      if (!rawData || (typeof rawData === 'object' && 'ok' in rawData && !rawData.ok)) {
        return undefined;
      }

      // Unwrap Replit DB response if needed
      let data: T;
      if (typeof rawData === 'object' && rawData !== null && 'ok' in rawData && 'value' in rawData) {
        // Data is wrapped: {ok: true, value: "..."}
        if (typeof rawData.value === 'string') {
          // Try to parse as JSON, if it fails, return as-is
          try {
            data = JSON.parse(rawData.value);
          } catch {
            data = rawData.value as T;
          }
        } else {
          data = rawData.value;
        }
      } else if (typeof rawData === 'string') {
        // Data is string - try to parse as JSON, if it fails, return as-is
        try {
          data = JSON.parse(rawData);
        } catch {
          data = rawData as T;
        }
      } else {
        // Data is already an object
        data = rawData as T;
      }

      return data;
    } catch (error) {
      console.error(`[DB] Error getting key ${key}:`, error);
      return undefined;
    }
  }

  /**
   * Get an array value from the database with automatic unwrapping.
   * Returns an empty array if the key doesn't exist or if there's an error.
   */
  async getArray<T>(key: string): Promise<T[]> {
    try {
      const rawData = await this.db.get(key);

      if (!rawData || (typeof rawData === 'object' && 'ok' in rawData && !rawData.ok)) {
        return [];
      }

      let array: T[] = [];
      if (typeof rawData === 'object' && 'ok' in rawData && 'value' in rawData && rawData.ok) {
        // Unwrap the value
        if (typeof rawData.value === 'string') {
          // Parse JSON string
          try {
            const parsed = JSON.parse(rawData.value);
            array = Array.isArray(parsed) ? parsed : [];
          } catch {
            array = [];
          }
        } else if (Array.isArray(rawData.value)) {
          array = rawData.value;
        }
      } else if (typeof rawData === 'string') {
        // Parse JSON string
        try {
          const parsed = JSON.parse(rawData);
          array = Array.isArray(parsed) ? parsed : [];
        } catch {
          array = [];
        }
      } else if (Array.isArray(rawData)) {
        array = rawData;
      }

      return array;
    } catch (error) {
      console.error(`[DB] Error getting array ${key}:`, error);
      return [];
    }
  }

  /**
   * Set a value in the database with automatic serialization.
   * Objects and arrays are automatically converted to JSON strings for consistent storage.
   * Primitive values are stored as-is.
   */
  async set<T>(key: string, value: T): Promise<void> {
    try {
      // Convert objects and arrays to JSON string for consistent serialization
      const dataToStore = (typeof value === 'object' && value !== null) ? JSON.stringify(value) : value;
      await this.db.set(key, dataToStore);
    } catch (error) {
      console.error(`[DB] Error setting key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Delete a key from the database.
   * Returns true if successful, false otherwise.
   */
  async delete(key: string): Promise<boolean> {
    try {
      await this.db.delete(key);
      return true;
    } catch (error) {
      console.error(`[DB] Error deleting key ${key}:`, error);
      return false;
    }
  }

  /**
   * List all keys with an optional prefix filter.
   * Returns an array of key strings.
   */
  async list(prefix?: string): Promise<string[]> {
    try {
      const keysData = await this.db.list(prefix);

      // Unwrap response if needed
      if (typeof keysData === 'object' && 'value' in keysData) {
        return Array.isArray(keysData.value) ? keysData.value : [];
      } else if (Array.isArray(keysData)) {
        return keysData;
      }

      return [];
    } catch (error) {
      console.error('[DB] Error listing keys:', error);
      return [];
    }
  }

  /**
   * Get the underlying Database instance (for compatibility with existing code).
   * Use this sparingly - prefer using the DatabaseService methods.
   */
  getDatabase(): Database {
    return this.db;
  }
}
