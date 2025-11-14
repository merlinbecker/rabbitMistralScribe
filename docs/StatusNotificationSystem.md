# Status Notification System

## Übersicht

Das Status-Benachrichtigungssystem ersetzt das bisherige Toast-System durch eine elegantere, icon-basierte Lösung in der oberen Statusleiste.

## Features

- **Icon-basierte Anzeige**: Anstelle von Toast-Popups werden Benachrichtigungen mit passenden Icons in der Statusleiste angezeigt
- **Queuing-System**: Mehrere Benachrichtigungen werden nacheinander angezeigt, ohne sich zu überlagern
- **Automatisches Timeout**: Benachrichtigungen verschwinden nach 10 Sekunden (konfigurierbar)
- **Typisierte Benachrichtigungen**: Vier Benachrichtigungstypen mit eindeutigen Icons:
  - `success`: Grünes Häkchen-Icon (CheckCircle2)
  - `error`: Rotes X-Icon (XCircle)
  - `warning`: Gelbes Warndreieck-Icon (AlertCircle)
  - `info`: Blaues Info-Icon (Info)

## Verwendung

### Hook verwenden

```typescript
import { useStatusNotification } from '@/hooks/use-status-notification';

function MyComponent() {
  const { notify, dismiss } = useStatusNotification();

  const handleAction = () => {
    notify({
      title: 'Erfolgreich gespeichert',
      description: 'Ihre Änderungen wurden gespeichert',
      type: 'success',
      duration: 10000, // optional, default: 10000ms
    });
  };

  return <button onClick={handleAction}>Speichern</button>;
}
```

### Globale Funktionen

```typescript
import { showStatusNotification, dismissStatusNotification } from '@/hooks/use-status-notification';

// Benachrichtigung anzeigen
const id = showStatusNotification({
  title: 'Upload läuft',
  type: 'info',
});

// Benachrichtigung manuell ausblenden
dismissStatusNotification(id);
```

## Verhalten

1. **Wenn keine Benachrichtigung aktiv ist**: Die neue Benachrichtigung wird sofort angezeigt
2. **Wenn eine Benachrichtigung aktiv ist**: Die neue Benachrichtigung wird zur Queue hinzugefügt
3. **Nach Timeout**: Die Benachrichtigung verschwindet automatisch und die nächste aus der Queue wird angezeigt
4. **Fallback**: Wenn keine Benachrichtigung aktiv ist, wird der Online/Offline-Status angezeigt

## Integration in StatusBar

Die Benachrichtigungen werden direkt in der `StatusBar`-Komponente angezeigt, die sich oben im Interface befindet. Dadurch sind sie:
- Immer sichtbar
- Nicht störend (keine Overlays)
- Konsistent mit dem Rest der UI
- Platzsparend (nutzen vorhandenen Raum)

## Testing

Das System ist vollständig getestet:
- `tests/use-status-notification.test.ts`: Tests für den Hook und Queue-Logik
- `tests/StatusBar.test.tsx`: Integration-Tests für die UI-Komponente

## Migration von Toast zu StatusNotification

Alte Toast-Aufrufe:
```typescript
toast({
  title: 'Erfolg',
  description: 'Gespeichert',
  variant: 'destructive',
});
```

Neue StatusNotification-Aufrufe:
```typescript
notify({
  title: 'Erfolg',
  description: 'Gespeichert',
  type: 'error', // 'destructive' wird zu 'error'
});
```

## Vorteile gegenüber Toast

1. **Konsistenter Platz**: Nutzt den vorhandenen Platz in der Statusleiste
2. **Keine Unterbrechung**: Kein Pop-up-Overlay, das den Content verdeckt
3. **Queuing**: Mehrere Benachrichtigungen werden nacheinander angezeigt
4. **Einfacher Code**: Weniger Dependencies (kein Radix Toast mehr nötig)
5. **Bessere UX**: Nutzer können den Status immer sehen, ohne dass etwas aufpoppt
