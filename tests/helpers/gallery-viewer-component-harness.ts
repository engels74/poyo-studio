import type { AddressInfo } from 'node:net';
import { createServer as createTcpServer } from 'node:net';
import { join } from 'node:path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import UnoCSS from '@unocss/vite';
import { createServer as createViteServer, type ViteDevServer } from 'vite';
import { createTemporaryDirectory } from './temporary-directory';

const host = '127.0.0.1';
const repositoryRoot = process.cwd();
const harnessRoot = join(repositoryRoot, 'tests', 'helpers', 'gallery-viewer-lifecycle-harness');

export interface GalleryViewerComponentHarness {
  url: string;
  stop: () => Promise<void>;
}

async function availableLoopbackPort(): Promise<number> {
  const probe = createTcpServer();
  await new Promise<void>((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, host, resolve);
  });
  const address = probe.address();
  if (!address || typeof address === 'string') {
    probe.close();
    throw new Error('GalleryViewer lifecycle port probe did not bind a TCP address.');
  }
  await new Promise<void>((resolve, reject) => {
    probe.close((error) => (error ? reject(error) : resolve()));
  });
  return address.port;
}

export async function startGalleryViewerComponentHarness(): Promise<GalleryViewerComponentHarness> {
  let temporary: Awaited<ReturnType<typeof createTemporaryDirectory>> | undefined;
  let server: ViteDevServer | undefined;
  let stopped = false;

  const stop = async (primaryError?: unknown, preservePrimaryError = false): Promise<void> => {
    if (stopped) return;
    stopped = true;

    const cleanupErrors: unknown[] = [];
    if (server) {
      try {
        await server.close();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (temporary) {
      try {
        await temporary.cleanup();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }

    if (cleanupErrors.length === 0) return;
    if (preservePrimaryError) {
      throw new AggregateError(
        cleanupErrors,
        'GalleryViewer lifecycle harness startup and cleanup failed.',
        { cause: primaryError }
      );
    }
    if (cleanupErrors.length === 1) throw cleanupErrors[0];
    throw new AggregateError(cleanupErrors, 'GalleryViewer lifecycle harness cleanup failed.');
  };

  try {
    temporary = await createTemporaryDirectory('poyo-gallery-viewer-harness-');
    server = await createViteServer({
      appType: 'spa',
      root: harnessRoot,
      publicDir: join(repositoryRoot, 'tests', 'fixtures', 'media'),
      cacheDir: join(temporary.path, 'vite-cache'),
      configFile: false,
      plugins: [UnoCSS(join(repositoryRoot, 'uno.config.ts')), svelte()],
      resolve: {
        alias: {
          $lib: join(repositoryRoot, 'src', 'lib')
        }
      },
      server: {
        host,
        port: await availableLoopbackPort(),
        strictPort: true,
        fs: {
          allow: [repositoryRoot]
        }
      }
    });
    await server.listen();

    const address = server.httpServer?.address();
    if (!address || typeof address === 'string') {
      throw new Error('GalleryViewer lifecycle harness did not bind a TCP loopback address.');
    }

    const { address: boundHost, port: boundPort } = address as AddressInfo;
    if (boundHost !== host) {
      throw new Error(
        'GalleryViewer lifecycle harness did not bind the requested loopback address.'
      );
    }
    return {
      url: `http://${boundHost}:${boundPort}`,
      stop
    };
  } catch (error) {
    await stop(error, true);
    throw error;
  }
}
