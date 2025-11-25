
import { ReplitStorage } from "../server/replitStorage";
import { DatabaseService } from "../server/databaseService";
import { randomUUID } from "crypto";

// Mock DatabaseService
class MockDatabaseService extends DatabaseService {
    private store = new Map<string, any>();

    async get<T>(key: string): Promise<T | undefined> {
        return this.store.get(key);
    }

    async set(key: string, value: any): Promise<void> {
        this.store.set(key, value);
    }

    async delete(key: string): Promise<void> {
        this.store.delete(key);
    }

    async getArray<T>(key: string): Promise<T[]> {
        return this.store.get(key) || [];
    }
}

async function testMemoryStorage() {
    console.log("Testing ReplitStorage in-memory audio...");

    const db = new MockDatabaseService();
    const storage = new ReplitStorage(db);

    const recordingId = randomUUID();
    const audioData = "base64encodedaudiocontent";

    // Test Save
    console.log("Saving audio...");
    await storage.saveAudio(recordingId, audioData);

    // Test Get
    console.log("Retrieving audio...");
    const retrieved = await storage.getAudio(recordingId);
    if (retrieved === audioData) {
        console.log("✅ Audio retrieved successfully");
    } else {
        console.error("❌ Audio retrieval failed", { expected: audioData, got: retrieved });
    }

    // Test Delete
    console.log("Deleting audio...");
    await storage.deleteAudio(recordingId);

    // Verify Delete
    const deleted = await storage.getAudio(recordingId);
    if (deleted === undefined) {
        console.log("✅ Audio deleted successfully");
    } else {
        console.error("❌ Audio deletion failed, data still exists");
    }
}

testMemoryStorage().catch(console.error);
