import type { FinExtractionResult } from "@brain/shared";

/**
 * OCR / extraction provider seam — mirrors the LLM + embeddings adapters. An OcrProvider turns
 * a raw financial source (pasted text now; images/PDF via the vision provider in Stage 1c) into
 * structured DRAFT candidates the user confirms. There is ALWAYS a no-key path: the heuristic
 * text parser (ocr/heuristic.ts) needs no cloud provider, so ingestion works fully offline.
 */
export interface OcrSource {
  kind: "paste" | "image" | "pdf";
  /** For paste: the raw text. For image/pdf (Stage 1c): a data URL / base64 the vision provider reads. */
  text?: string;
  dataUrl?: string;
  mime?: string;
}

export interface OcrProvider {
  readonly name: "heuristic" | "vision";
  /** Can this provider handle the given source? (heuristic: text only; vision: images/pdf). */
  supports(source: OcrSource): boolean;
  extract(source: OcrSource): Promise<FinExtractionResult>;
}
