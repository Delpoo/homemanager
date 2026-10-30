import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const port = Number(process.env.HM_TEST_PORT ?? 4184);
const origin = ['http:', '', `127.0.0.1:${port}`].join('/');
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
};
http
  .createServer(async (req, res) => {
    try {
      const name = decodeURIComponent(new URL(req.url, origin).pathname);
      if (
        name !== '/docs/vision-mockup.html' &&
        !/^\/(?:dist\/|tests\/browser\/fixtures\/|\.work\/(?:card|editor|panels)\/)/.test(name)
      )
        throw new Error('Unknown fixture');
      const file = path.resolve(root, '.' + name);
      if (!file.startsWith(root + path.sep)) throw new Error('Invalid path');
      const body = await readFile(file);
      res
        .writeHead(200, {
          'content-type': types[path.extname(file)] ?? 'application/octet-stream',
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
        })
        .end(body);
    } catch {
      res.writeHead(404).end('Not found');
    }
  })
  .listen(port, '127.0.0.1', () => console.log(`Synthetic frontend harness ready on port ${port}.`));
