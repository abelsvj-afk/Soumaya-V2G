/**
 * Client-side document text extraction for knowledge uploads. Keeps the server
 * dependency-free (per documents route): the browser turns .txt/.md/.pdf/.docx
 * into plain text, then we send that text through the existing /documents endpoint.
 * PDF via pdf.js, DOCX via mammoth; both are dynamically imported so they only
 * load when actually needed (no cost to the rest of the app).
 */

export interface ExtractedFile {
  text: string;
  /** Suggested document name (filename without extension). */
  name: string;
}

const stripExt = (filename: string): string => filename.replace(/\.[^./\\]+$/, "");

/** Extract readable text from a picked file, by type. Throws on unsupported/empty. */
export async function extractFileText(file: File): Promise<ExtractedFile> {
  const name = stripExt(file.name);
  const lower = file.name.toLowerCase();

  if (lower.endsWith(".pdf") || file.type === "application/pdf") {
    const text = await extractPdf(file);
    return { text, name };
  }

  if (
    lower.endsWith(".docx") ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const mammoth = await import("mammoth/mammoth.browser.js");
    const buf = await file.arrayBuffer();
    const { value } = await mammoth.extractRawText({ arrayBuffer: buf });
    if (!value.trim()) throw new Error("No readable text found in that .docx.");
    return { text: value, name };
  }

  // Plain text / Markdown (and any other text-like file).
  const text = await file.text();
  if (!text.trim()) throw new Error("That file appears to be empty.");
  return { text, name };
}

async function extractPdf(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  // Vite resolves the worker URL; pdf.js needs it set before loading a document.
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const parts: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const line = content.items
      .map((it) => ("str" in it ? (it as { str: string }).str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (line) parts.push(line);
  }
  await doc.cleanup();
  const text = parts.join("\n\n");
  if (!text.trim()) throw new Error("No selectable text found in that PDF (it may be scanned images).");
  return text;
}
