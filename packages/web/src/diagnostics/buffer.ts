/**
 * packages/web/src/diagnostics/buffer.ts
 *
 * Lightweight, fixed-size in-memory ring buffer for diagnostic event tracking.
 * Provides a production-safe "flight recorder" for post-crash analysis
 * without causing memory growth or performance overhead in the hot path.
 */

import { isDiagnosticsEnabled, setDiagnosticsEnabled } from './config';

export type DiagnosticEventType = 'state' | 'effect' | 'callback' | 'event' | 'error';

export type DiagnosticEvent = {
  timestamp: number;
  type: DiagnosticEventType;
  source: string;
  data?: any;
};

const MAX_EVENTS = 100;
const buffer: DiagnosticEvent[] = [];
let pointer = 0;

/**
 * Logs a diagnostic event to the rolling buffer.
 * Bounded by MAX_EVENTS to ensure zero memory growth over time.
 */
export const logDiagnosticEvent = (type: DiagnosticEventType, source: string, data?: any): void => {
  if (!isDiagnosticsEnabled()) return;

  const event: DiagnosticEvent = {
    timestamp: Date.now(),
    type,
    source,
    data,
  };

  if (buffer.length < MAX_EVENTS) {
    buffer.push(event);
  } else {
    buffer[pointer] = event;
    pointer = (pointer + 1) % MAX_EVENTS;
  }
};

/**
 * Retrieves all events in chronological order.
 */
export const getDiagnosticEvents = (): DiagnosticEvent[] => {
  if (buffer.length < MAX_EVENTS) {
    return [...buffer];
  }
  // The buffer is filled, return items in order:
  // [pointer...MAX_EVENTS-1, 0...pointer-1]
  return [
    ...buffer.slice(pointer),
    ...buffer.slice(0, pointer),
  ];
};

/**
 * Clears the diagnostic event buffer.
 */
export const clearDiagnosticEvents = (): void => {
  buffer.length = 0;
  pointer = 0;
};

/**
 * Generates a diagnostic snapshot for crash reports or console export.
 */
export const getDiagnosticSnapshot = (): {
  events: DiagnosticEvent[];
  count: number;
  capturedAt: number;
  version: string;
} => {
  const events = getDiagnosticEvents();
  return {
    events,
    count: events.length,
    capturedAt: Date.now(),
    version: '0.1.0', // Build version placeholder
  };
};

// Expose to window for post-deployment debugging via console
if (typeof window !== 'undefined') {
  (window as any).soumayaDiagnostics = {
    enable: () => setDiagnosticsEnabled(true),
    disable: () => setDiagnosticsEnabled(false),
    status: isDiagnosticsEnabled,
    clear: clearDiagnosticEvents,
    getEvents: getDiagnosticEvents,
    snapshot: getDiagnosticSnapshot,
  };

  // Global runtime diagnostic layer
  window.addEventListener('error', (event) => {
    logDiagnosticEvent('error', 'window.error', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    logDiagnosticEvent('error', 'window.unhandledrejection', {
      reason: event.reason?.message || String(event.reason),
      stack: event.reason?.stack,
    });
  });
}
