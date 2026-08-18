/**
 * packages/web/src/diagnostics/config.ts
 *
 * Runtime configuration for the diagnostic system.
 * Defaults to OFF to ensure zero overhead in normal production operation.
 */

let enabled = false;

export const isDiagnosticsEnabled = (): boolean => enabled;

export const setDiagnosticsEnabled = (value: boolean): void => {
  enabled = value;
  console.log(`[diagnostics] Diagnostic recording ${value ? 'ENABLED' : 'DISABLED'}`);
};
