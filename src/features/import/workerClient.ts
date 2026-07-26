import type { ParsedFile } from './parseNetscape';
import type { WorkerRequest, WorkerResponse } from '@/workers/importWorker';

/**
 * Parses files off the main thread so a large export (thousands of entries)
 * does not freeze the UI. Terminates the worker on every exit path — success,
 * a posted error, and the worker's own error event — so a failed import never
 * leaks a live worker.
 */
export function parseFilesInWorker(
  files: { fileName: string; text: string }[],
  onProgress: (done: number, total: number, fileName: string) => void,
): Promise<{ fileName: string; parsed: ParsedFile }[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('@/workers/importWorker.ts', import.meta.url), {
      type: 'module',
    });
    const id = crypto.randomUUID();

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (message.id !== id) return;

      if (message.type === 'progress') {
        onProgress(message.done, message.total, message.fileName);
      } else if (message.type === 'result') {
        worker.terminate();
        resolve(message.files);
      } else {
        worker.terminate();
        reject(new Error(message.message));
      }
    };

    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || 'The import worker failed.'));
    };

    const request: WorkerRequest = { id, files };
    worker.postMessage(request);
  });
}
