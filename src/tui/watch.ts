import { watch } from 'chokidar';
import type { Library } from '../library.js';

export interface ChangeSource {
  subscribe(listener: (error?: string) => void | Promise<void>): () => void;
}
export async function startWatch(
  library: Library,
  enabled = true,
): Promise<ChangeSource & { close(): Promise<void> }> {
  const listeners = new Set<(error?: string) => void | Promise<void>>();
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let queue = Promise.resolve();
  let lastError: string | undefined;
  const emit = async (error?: string) => {
    if (closed) return;
    lastError = error;
    await Promise.all(
      [...listeners].map((listener) =>
        Promise.resolve().then(() => {
          if (!closed) return listener(error);
        }),
      ),
    ).catch(() => {});
  };
  const enqueue = () => {
    queue = queue.then(async () => {
      if (closed) return;
      try {
        await library.refresh();
        await emit();
      } catch {
        await emit('Cannot refresh documents. Check target permissions.');
      }
    });
    return queue;
  };
  const watcher = enabled
    ? watch(
        library.targets.map((t) => t.file),
        {
          ignoreInitial: true,
          followSymlinks: false,
          // Polling avoids native watcher limits when reading large directory trees.
          usePolling: true,
          interval: 500,
          ignored: (file, stats) =>
            !library.shouldWatch(file, stats?.isDirectory()),
          awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
        },
      )
    : undefined;
  const ready = new Promise<void>((resolve, reject) => {
    if (!watcher) {
      resolve();
      return;
    }
    watcher.once('ready', resolve);
    watcher.once('error', reject);
  });
  watcher?.on('all', () => {
    if (closed) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      void enqueue();
    }, 80);
  });
  watcher?.on('error', () => {
    void emit('File watching failed. Restart to retry.');
  });
  const close = async () => {
    closed = true;
    clearTimeout(timer);
    listeners.clear();
    await watcher?.close();
    await queue;
  };
  try {
    await ready;
    if (enabled) await enqueue();
  } catch (error) {
    await close();
    throw error;
  }
  return {
    subscribe(listener) {
      if (closed) return () => {};
      listeners.add(listener);
      if (lastError)
        void Promise.resolve()
          .then(() => {
            if (!closed && listeners.has(listener)) return listener(lastError);
          })
          .catch(() => {});
      return () => {
        listeners.delete(listener);
      };
    },
    close,
  };
}
