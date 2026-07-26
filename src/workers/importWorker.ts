/// <reference lib="webworker" />
import { parseNetscape, type ParsedFile } from '@/features/import/parseNetscape';

export type WorkerRequest = { id: string; files: { fileName: string; text: string }[] };
export type WorkerResponse =
  | { type: 'progress'; id: string; fileName: string; done: number; total: number }
  | { type: 'result'; id: string; files: { fileName: string; parsed: ParsedFile }[] }
  | { type: 'error'; id: string; message: string };

// Thin transport shell. All parsing logic lives in parseNetscape so it stays
// unit-testable without a worker; this file only moves bytes across the
// worker boundary and reports progress.
self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, files } = event.data;
  const post = (message: WorkerResponse) => self.postMessage(message);

  try {
    const results: { fileName: string; parsed: ParsedFile }[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      post({ type: 'progress', id, fileName: file.fileName, done: i, total: files.length });
      results.push({ fileName: file.fileName, parsed: parseNetscape(file.text) });
    }
    post({ type: 'progress', id, fileName: '', done: files.length, total: files.length });
    post({ type: 'result', id, files: results });
  } catch (e) {
    post({ type: 'error', id, message: (e as Error).message });
  }
};
