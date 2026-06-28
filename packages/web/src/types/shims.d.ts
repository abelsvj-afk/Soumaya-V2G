/// <reference types="vite/client" />

// mammoth ships a browser build with no bundled types; we only use extractRawText.
declare module "mammoth/mammoth.browser.js" {
  export function extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{
    value: string;
    messages: unknown[];
  }>;
}
