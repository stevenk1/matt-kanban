// The Node implementation of the file-system port. It backs the Board reader's tests,
// which run against real temporary folder trees.
import { access, readdir, readFile, stat } from 'node:fs/promises';
import type { FileSystem } from './file-system';

export const nodeFileSystem: FileSystem = {
  listDir: (path) => readdir(path),
  readText: (path) => readFile(path, 'utf8'),
  async stat(path) {
    const s = await stat(path);
    return { isDirectory: s.isDirectory(), modifiedAt: s.mtimeMs };
  },
  exists: (path) =>
    access(path).then(
      () => true,
      () => false,
    ),
};
