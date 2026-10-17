import React from 'react';
import { render } from 'ink';
import type { Library } from '../library.js';
import { App } from './app.js';
import { startWatch } from './watch.js';
import { openLocalImage } from './images.js';

export async function runTui(
  library: Library,
  watchFiles = true,
): Promise<void> {
  const changes = await startWatch(library, watchFiles);
  let app: ReturnType<typeof render> | undefined;
  const stop = () => app?.unmount();
  try {
    app = render(
      <App library={library} changes={changes} imageOpener={openLocalImage} />,
      {
        alternateScreen: true,
        exitOnCtrlC: false,
        kittyKeyboard: { mode: 'disabled' },
      },
    );
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    await app.waitUntilExit();
  } finally {
    app?.unmount();
    await changes.close();
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
}
