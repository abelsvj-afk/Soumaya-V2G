/**
 * packages/web/src/diagnostics/config.ts
 *
 * Runtime configuration for the diagnostic system.
 * Defaults to OFF to ensure zero overhead in normal production operation.
 */

let enabled = false;
try {
  enabled = localStorage.getItem('soumaya.diagnosticsEnabled') === '1';
} catch {
  // Ignore if localStorage is unavailable
}

export const isDiagnosticsEnabled = (): boolean => enabled;

export const setDiagnosticsEnabled = (value: boolean): void => {
  enabled = value;
  console.log(`[diagnostics] Diagnostic recording ${value ? 'ENABLED' : 'DISABLED'}`);
  try {
    localStorage.setItem('soumaya.diagnosticsEnabled', value ? '1' : '0');
  } catch {
    // Ignore if localStorage is unavailable
  }
};
