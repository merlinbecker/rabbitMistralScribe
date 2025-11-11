
# Replit Database - Dokumentation

## Übersicht

Die Replit Database ist eine Key-Value-basierte NoSQL-Datenbank, die in jedem Repl verfügbar ist. Sie bietet persistenten Speicher für Daten ohne zusätzliche Setup-Schritte.

---

## Wichtige Erkenntnisse aus der Implementierung

### 1. Response Wrapping Verhalten

**KRITISCH**: Replit Database gibt Daten in einem Wrapper-Objekt zurück:

```typescript
// Bei erfolgreicher Abfrage:
{ ok: true, value: "<actual-data>" }

// Bei fehlgeschlagener Abfrage (z.B. Key nicht gefunden):
{ ok: false, error: { message: "", statusCode: 404 }, errorExtras: undefined }
```

**Wichtig**: Dieses Wrapping ist **NICHT** konsistent dokumentiert und führt zu häufigen Bugs, wenn nicht korrekt behandelt.

### 2. Korrekte Daten-Unwrapping-Logik

Alle `get()`-Operationen müssen diese Logik implementieren:

```typescript
async getData(key: string): Promise<T | undefined> {
  try {
    const rawData = await this.db.get(key);
    
    // 1. Prüfen ob Daten existieren und nicht ein Error-Objekt sind
    if (!rawData || (typeof rawData === 'object' && 'ok' in rawData && !rawData.ok)) {
      return undefined;
    }
    
    // 2. Wrapper entpacken falls vorhanden
    let data: T;
    if (typeof rawData === 'object' && rawData !== null && 'ok' in rawData && 'value' in rawData) {
      // Daten sind gewickelt: {ok: true, value: "..."}
      data = typeof rawData.value === 'string' ? JSON.parse(rawData.value) : rawData.value;
    } else if (typeof rawData === 'string') {
      // Daten sind JSON-String
      data = JSON.parse(rawData);
    } else {
      // Daten sind bereits Objekt
      data = rawData as T;
    }
    
    return data;
  } catch (error) {
    console.error('[DB] Error getting data:', error);
    return undefined;
  }
}
```

### 3. Daten-Serialisierung beim Speichern

**Best Practice**: Komplexe Objekte immer als JSON-String speichern:

```typescript
async setData(key: string, data: T): Promise<void> {
  // Objekte zu JSON-String konvertieren
  const dataToStore = typeof data === 'object' ? JSON.stringify(data) : data;
  await this.db.set(key, dataToStore);
}
```

**Grund**: Dies gewährleistet konsistente Serialisierung und verhindert Datenverlust bei komplexen Objekten.

### 4. Date-Handling

Date-Objekte werden beim Speichern **NICHT** automatisch korrekt serialisiert:

```typescript
// ❌ FALSCH - Date wird möglicherweise nicht korrekt gespeichert
await db.set('user', { createdAt: new Date() });

// ✅ RICHTIG - Date zu ISO-String konvertieren
await db.set('user', { 
  createdAt: new Date().toISOString() 
});

// Beim Laden wieder zu Date konvertieren
const user = await db.get('user');
const createdAt = new Date(user.createdAt);
```

---

## Implementierungsbeispiel: ReplitStorage

Siehe [`server/replitStorage.ts`](rag://rag_source_1) für eine vollständige Implementierung mit:
- Korrektem Unwrapping
- Error-Handling
- JSON-Serialisierung
- Type-Safety

---

## Häufige Fallstricke

### 1. Fehlendes Unwrapping

```typescript
// ❌ FEHLER - Daten werden nicht entpackt
const user = await db.get('user:123');
console.log(user.username); // undefined, weil user = {ok: true, value: {...}}

// ✅ KORREKT
const rawUser = await db.get('user:123');
const user = rawUser?.value ? JSON.parse(rawUser.value) : undefined;
console.log(user?.username);
```

### 2. Nicht-Prüfen auf Error-Objekte

```typescript
// ❌ FEHLER - Error-Objekt wird nicht erkannt
const data = await db.get('missing-key');
// data = {ok: false, error: {...}}
// Code versucht mit Error-Objekt zu arbeiten -> Crash

// ✅ KORREKT
const rawData = await db.get('missing-key');
if (!rawData || (typeof rawData === 'object' && 'ok' in rawData && !rawData.ok)) {
  return undefined; // Key existiert nicht
}
```

### 3. Array-Speicherung

Arrays benötigen spezielle Behandlung:

```typescript
// Speichern
const recordingIds = ['id1', 'id2', 'id3'];
await db.set('user:recordings', recordingIds);

// Laden mit Unwrapping
const rawIds = await db.get('user:recordings');
let recordingIds: string[] = [];

if (rawIds && typeof rawIds === 'object' && 'ok' in rawIds && rawIds.ok) {
  recordingIds = Array.isArray(rawIds.value) ? rawIds.value : [];
} else if (Array.isArray(rawIds)) {
  recordingIds = rawIds;
}
```

---

## Limits

- **Speicherplatz**: 50 MiB pro Datenbank (Summe aller Keys und Values)
- **Keys**: Maximal 5.000 Keys pro Datenbank
- **Key-Länge**: Maximal 1024 Bytes pro Key
- **Value-Größe**: Maximal 5 MiB pro Value
- **Rate Limits**: Bei Überschreitung → HTTP 429 (exponentielles Backoff empfohlen)

---

## Empfehlungen für Vereinfachung und Zentralisierung

### 1. Zentraler Database Service

**Problem**: Aktuell ist die Unwrapping-Logik in `ReplitStorage`, `ReplitSessionStore` und `JobQueue` dupliziert.

**Lösung**: Erstelle einen zentralen Database Service:

```typescript
// server/databaseService.ts
import Database from "@replit/database";

export class DatabaseService {
  private db: Database;
  
  constructor() {
    this.db = new Database();
  }
  
  // Generische get-Methode mit automatischem Unwrapping
  async get<T>(key: string): Promise<T | undefined> {
    try {
      const rawData = await this.db.get(key);
      
      if (!rawData || (typeof rawData === 'object' && 'ok' in rawData && !rawData.ok)) {
        return undefined;
      }
      
      let data: T;
      if (typeof rawData === 'object' && rawData !== null && 'ok' in rawData && 'value' in rawData) {
        data = typeof rawData.value === 'string' ? JSON.parse(rawData.value) : rawData.value;
      } else if (typeof rawData === 'string') {
        data = JSON.parse(rawData);
      } else {
        data = rawData as T;
      }
      
      return data;
    } catch (error) {
      console.error(`[DB] Error getting key ${key}:`, error);
      return undefined;
    }
  }
  
  // Generische set-Methode mit automatischer Serialisierung
  async set<T>(key: string, value: T): Promise<void> {
    try {
      const dataToStore = typeof value === 'object' ? JSON.stringify(value) : value;
      await this.db.set(key, dataToStore);
    } catch (error) {
      console.error(`[DB] Error setting key ${key}:`, error);
      throw error;
    }
  }
  
  // Array-spezifische get-Methode
  async getArray<T>(key: string): Promise<T[]> {
    try {
      const rawData = await this.db.get(key);
      
      if (!rawData || (typeof rawData === 'object' && 'ok' in rawData && !rawData.ok)) {
        return [];
      }
      
      let array: T[] = [];
      if (typeof rawData === 'object' && 'ok' in rawData && rawData.ok) {
        array = Array.isArray(rawData.value) ? rawData.value : [];
      } else if (Array.isArray(rawData)) {
        array = rawData;
      }
      
      return array;
    } catch (error) {
      console.error(`[DB] Error getting array ${key}:`, error);
      return [];
    }
  }
  
  async delete(key: string): Promise<boolean> {
    try {
      await this.db.delete(key);
      return true;
    } catch (error) {
      console.error(`[DB] Error deleting key ${key}:`, error);
      return false;
    }
  }
  
  async list(prefix?: string): Promise<string[]> {
    try {
      const keysData = await this.db.list(prefix);
      
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
}

// Singleton-Instanz exportieren
export const db = new DatabaseService();
```

### 2. Verwendung des zentralen Service

```typescript
// Statt direkter Replit Database Nutzung:
import Database from "@replit/database";
const db = new Database();
const rawUser = await db.get('user:123');
// ... komplexes Unwrapping ...

// Verwende den zentralen Service:
import { db } from './databaseService';
const user = await db.get<User>('user:123'); // Automatisches Unwrapping!
```

### 3. Type-Safety mit Generics

```typescript
interface User {
  id: string;
  username: string;
  createdAt: string;
}

// Type-safe Abruf
const user = await db.get<User>('user:123');
// TypeScript weiß: user ist User | undefined

// Type-safe Array
const userIds = await db.getArray<string>('user:recordings');
// TypeScript weiß: userIds ist string[]
```

### 4. Vereinfachung bestehender Storage-Klassen

Mit dem zentralen Service können `ReplitStorage`, `ReplitSessionStore` und `JobQueue` vereinfacht werden:

```typescript
// Vorher (in jeder Klasse):
const rawData = await this.db.get(key);
if (!rawData || (typeof rawData === 'object' && 'ok' in rawData && !rawData.ok)) {
  return undefined;
}
// ... 10+ Zeilen Unwrapping-Logik ...

// Nachher (mit zentralem Service):
const data = await db.get<MyType>(key);
```

**Geschätzter Code-Reduktion**: ~200-300 Zeilen duplizierter Unwrapping-Logik

---

## Migration zu zentralem Service

### Schritt 1: DatabaseService implementieren
Erstelle `server/databaseService.ts` wie oben beschrieben.

### Schritt 2: Storage-Klassen migrieren
Ersetze direkte `this.db.get()` Aufrufe durch `db.get<T>()` vom zentralen Service.

### Schritt 3: Tests anpassen
Aktualisiere Tests in `tests/` um den neuen Service zu mocken.

### Schritt 4: Schrittweise Rollout
Migriere eine Klasse nach der anderen, um Regressions-Risiken zu minimieren.

---

## Best Practices Zusammenfassung

1. ✅ **Immer** Unwrapping-Logik verwenden bei `get()` Operationen
2. ✅ **Immer** auf `{ok: false}` Error-Objekte prüfen
3. ✅ Komplexe Objekte als JSON-String speichern
4. ✅ Date-Objekte zu ISO-Strings konvertieren
5. ✅ Arrays mit spezieller Logik behandeln
6. ✅ Try-Catch für alle DB-Operationen
7. ✅ Logging für Debugging (ohne sensible Daten)
8. ✅ Zentralen Database Service verwenden (empfohlen)

---

## Referenzen

- Implementierung: [`server/replitStorage.ts`](rag://rag_source_1)
- Session Store: [`server/replitSessionStore.ts`](rag://rag_source_7)
- Job Queue: [`server/jobQueue.ts`](rag://rag_source_10)
- Tests: [`tests/replitStorage.test.ts`](rag://rag_source_12)
- Offizielle Docs: [Replit Database Docs](https://docs.replit.com/hosting/databases/replit-database)
