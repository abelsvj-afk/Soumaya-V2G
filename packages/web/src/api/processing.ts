import { useState, useEffect } from "react";

/**
 * Node "processing" state — which memories are mid-ingest ("Writing…" latency
 * feedback). Extracted from client.ts (Post-MVP D4) so domain modules that mark nodes
 * as processing can share it without a cycle. A tiny pub/sub over a Set of node ids.
 */
const processingNodes = new Set<number>();
const nodeProcessingListeners = new Set<(nodes: Set<number>) => void>();

export function isNodeProcessing(id: number): boolean {
  return processingNodes.has(id);
}

export function onNodeProcessingChange(cb: (nodes: Set<number>) => void): () => void {
  nodeProcessingListeners.add(cb);
  cb(new Set(processingNodes));
  return () => nodeProcessingListeners.delete(cb);
}

export function useProcessingNodes(): Set<number> {
  const [processing, setProcessing] = useState<Set<number>>(new Set(processingNodes));
  useEffect(() => {
    return onNodeProcessingChange(setProcessing);
  }, []);
  return processing;
}

export function setNodeProcessing(ids: number[], active: boolean): void {
  for (const id of ids) {
    if (active) processingNodes.add(id);
    else processingNodes.delete(id);
  }
  for (const l of nodeProcessingListeners) {
    try {
      l(new Set(processingNodes));
    } catch (e) {
      console.error(e);
    }
  }
}
