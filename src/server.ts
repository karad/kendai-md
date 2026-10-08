import { createServer, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { watch } from 'chokidar';
import { Library } from './library.js';
import { renderDocument } from './render.js';

const staticFiles: Record<string, { name: string; type: string }> = {
  '/': { name: 'index.html', type: 'text/html; charset=utf-8' },
  '/ui/client.js': {
    name: 'client.js',
    type: 'text/javascript; charset=utf-8',
  },
  '/ui/view-model.js': {
    name: 'view-model.js',
    type: 'text/javascript; charset=utf-8',
  },
  '/ui/styles.css': { name: 'styles.css', type: 'text/css; charset=utf-8' },
  '/ui/favicon.svg': { name: 'favicon.svg', type: 'image/svg+xml' },
  '/ui/kendai-mark.png': { name: 'kendai-mark.png', type: 'image/png' },
};

export async function startServer(
  library: Library,
  port = 0,
  watchFiles = true,
) {
  const clients = new Set<ServerResponse>();
  const respond = (response: ServerResponse, status: number, data: unknown) => {
    response.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
    });
    response.end(JSON.stringify(data));
  };
  const server = createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    );
    const address = server.address();
    const authority = `127.0.0.1:${typeof address === 'object' && address ? address.port : port}`;
    if (
      request.headers.host !== authority ||
      (request.headers.origin &&
        request.headers.origin !== `http://${authority}`)
    ) {
      respond(response, 403, {
        error: 'This server only accepts requests from its local address.',
      });
      return;
    }
    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET');
      respond(response, 405, { error: 'Method not allowed.' });
      return;
    }
    try {
      const url = new URL(request.url ?? '/', `http://${authority}`);
      const id = url.searchParams.get('id') ?? '';
      const asset = Object.hasOwn(staticFiles, url.pathname)
        ? staticFiles[url.pathname]
        : undefined;
      if (asset) {
        const content = await readFile(
          new URL(`./web/${asset.name}`, import.meta.url),
        );
        response.writeHead(200, { 'Content-Type': asset.type });
        response.end(content);
      } else if (url.pathname === '/api/library') {
        respond(response, 200, library.snapshot());
      } else if (url.pathname === '/api/document') {
        const document = await renderDocument(library, id);
        respond(
          response,
          document ? 200 : 404,
          document ?? {
            error: 'Document not found. It may have been moved or removed.',
          },
        );
      } else if (url.pathname === '/api/resolve' || url.pathname === '/link') {
        const href = url.searchParams.get('href') ?? '';
        if (/^(?:[a-z][a-z\d+.-]*:|\/|\\)/i.test(href)) {
          respond(response, 400, {
            error: 'Only relative document links are supported.',
          });
          return;
        }
        const hashIndex = href.indexOf('#');
        const fragment =
          hashIndex < 0
            ? ''
            : `#${encodeURIComponent(decodeURIComponent(href.slice(hashIndex + 1)))}`;
        const file = decodeURIComponent(
          (hashIndex < 0 ? href : href.slice(0, hashIndex)).split('?')[0] ?? '',
        );
        const resolvedId = file
          ? await library.resolveDocument(id, file)
          : library.get(id)?.entry.id;
        if (!resolvedId) {
          respond(response, 404, {
            error:
              'This document is outside your targets. Include it with -t to read it here.',
          });
          return;
        }
        const destination = `/?doc=${resolvedId}${fragment}`;
        if (url.pathname === '/link') {
          response.writeHead(303, { Location: destination });
          response.end();
        } else respond(response, 200, { url: destination });
      } else if (url.pathname === '/asset') {
        const asset = await library.resolveAsset(
          id,
          url.searchParams.get('path') ?? '',
        );
        if (!asset)
          respond(response, 404, {
            error: 'Image not found in the selected targets.',
          });
        else {
          const content = await readFile(asset.file);
          response.setHeader(
            'Content-Security-Policy',
            "default-src 'none'; sandbox",
          );
          response.writeHead(200, { 'Content-Type': asset.type });
          response.end(content);
        }
      } else if (url.pathname === '/events') {
        response.writeHead(200, {
          'Content-Type': 'text/event-stream',
          Connection: 'keep-alive',
        });
        response.write('event: ready\ndata: {}\n\n');
        clients.add(response);
        request.on('close', () => clients.delete(response));
      } else respond(response, 404, { error: 'Not found.' });
    } catch (error) {
      const malformed = error instanceof URIError;
      if (!malformed) console.error('kendai: request failed:', error);
      if (!response.headersSent)
        respond(response, malformed ? 400 : 500, {
          error: malformed
            ? 'Invalid URL encoding.'
            : 'Unable to read this document.',
        });
      else response.end();
    }
  });

  const watcher = watchFiles
    ? watch(
        library.targets.map((target) => target.file),
        {
          ignoreInitial: true,
          followSymlinks: false,
          // Polling avoids per-path native watcher limits in large workspaces.
          usePolling: true,
          interval: 500,
          ignored: (file, stats) =>
            !library.shouldWatch(file, stats?.isDirectory()),
          awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
        },
      )
    : undefined;
  const watcherReady = new Promise<void>((resolve, reject) => {
    if (!watcher) {
      resolve();
      return;
    }
    watcher.once('ready', resolve);
    watcher.once('error', reject);
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  let refresh = Promise.resolve();
  watcher?.on('all', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      refresh = refresh
        .then(async () => {
          if (closed) return;
          await library.refresh();
          for (const client of clients)
            client.write('event: change\ndata: {}\n\n');
        })
        .catch((error: unknown) => {
          console.error('kendai: could not refresh documents:', error);
          for (const client of clients)
            client.write('event: watch-error\ndata: {}\n\n');
        });
    }, 80);
  });
  watcher?.on('error', (error) => {
    console.error('kendai: file watcher failed:', error);
    for (const client of clients)
      client.write('event: watch-error\ndata: {}\n\n');
  });
  const heartbeat = setInterval(() => {
    for (const client of clients) client.write(': keep-alive\n\n');
  }, 20_000);
  heartbeat.unref();
  try {
    await Promise.all([
      watcherReady,
      new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => {
          server.off('error', reject);
          resolve();
        });
      }),
    ]);
    // Capture changes between the initial scan and watcher readiness.
    if (watchFiles) await library.refresh();
  } catch (error) {
    clearTimeout(timer);
    clearInterval(heartbeat);
    await watcher?.close();
    server.close();
    throw error;
  }
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Unable to determine server address.');
  return {
    url: `http://127.0.0.1:${address.port}`,
    async close() {
      closed = true;
      clearTimeout(timer);
      clearInterval(heartbeat);
      await watcher?.close();
      await refresh;
      for (const client of clients) client.end();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
