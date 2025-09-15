// A very simple in-memory ephemeral store for passing large payloads
// between the POST /api/chat/stream initializer and the GET /api/chat/stream/[streamId]
// route in the Edge runtime without putting large JSON into query params.
// NOTE: This store is per-server-instance and will NOT work across multiple regions
// or server restarts. For production horizontal scale you'd replace this with
// Redis or another low-latency shared store.

export interface StreamPayload {
  messages: any[];
  pdfText: Record<string, any>;
  pdfId?: string;
  currentPage?: number;
  pageHints?: Array<{ page: number; score: number; snippet: string }>;
  createdAt: number;
}

const TTL_MS = 2 * 60 * 1000; // 2 minutes

// Internal map; keys are streamIds
const store = new Map<string, StreamPayload>();

// Cleanup runs lazily on set/get to avoid interval overhead in Edge
function cleanup() {
  const now = Date.now();
  for (const [key, value] of store.entries()) {
    if (now - value.createdAt > TTL_MS) {
      store.delete(key);
    }
  }
}

export function setStreamPayload(streamId: string, payload: Omit<StreamPayload, 'createdAt'>) {
  cleanup();
  store.set(streamId, { ...payload, createdAt: Date.now() });
}

export function getStreamPayload(streamId: string): StreamPayload | undefined {
  cleanup();
  return store.get(streamId);
}

export function deleteStreamPayload(streamId: string) {
  store.delete(streamId);
}
