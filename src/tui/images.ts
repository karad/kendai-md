import {
  spawn,
  type ChildProcess,
  type SpawnOptions,
} from 'node:child_process';
import path from 'node:path';
import { parseLink } from './navigation.js';

export type ImageOpener = (
  file: string,
  onFailure: (message: string) => void,
) => Promise<void>;
type Launcher = (
  command: string,
  args: string[],
  options: SpawnOptions,
) => ChildProcess;

export function imagePath(href: string): string {
  try {
    const { file } = parseLink(href);
    if (!file) throw new Error('Empty image path');
    return file;
  } catch {
    throw new Error('Only valid relative local image paths can be opened.');
  }
}

export async function openLocalImage(
  file: string,
  onFailure: (message: string) => void,
  options: { platform?: NodeJS.Platform; launch?: Launcher } = {},
): Promise<void> {
  if (!path.isAbsolute(file))
    throw new Error('Cannot open image: an absolute local path is required.');
  const platform = options.platform ?? process.platform;
  if (!['darwin', 'linux', 'win32'].includes(platform))
    throw new Error('Cannot open images on this platform.');
  const command =
    platform === 'darwin'
      ? 'open'
      : platform === 'linux'
        ? 'xdg-open'
        : 'powershell.exe';
  // Keep filenames out of PowerShell code: a valid filename can contain expressions.
  const args =
    platform === 'win32'
      ? [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          'Start-Process -FilePath $env:KENDAI_IMAGE_PATH -ErrorAction Stop',
        ]
      : [file];
  const settings: SpawnOptions = {
    stdio: 'ignore',
    shell: false,
    detached: true,
    ...(platform === 'win32'
      ? { env: { ...process.env, KENDAI_IMAGE_PATH: file } }
      : {}),
  };
  const launch = options.launch ?? spawn;
  await new Promise<void>((resolve, reject) => {
    const child = launch(command, args, settings);
    let spawned = false,
      reported = false;
    const fail = () => {
      if (reported) return;
      reported = true;
      const message =
        'Cannot open image. Check the default image application and desktop environment.';
      if (spawned) onFailure(message);
      else reject(new Error(message));
    };
    child.on('error', fail);
    child.once('exit', (code) => {
      if (code !== 0) fail();
    });
    child.once('spawn', () => {
      spawned = true;
      child.unref();
      resolve();
    });
  });
}
