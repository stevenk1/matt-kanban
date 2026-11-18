// The Tauri implementation of the file-system port, backed by the fs plugin. The app's
// capabilities (src-tauri/capabilities/default.json) grant it no folder of their own: settings.rs
// grants read-only access to each scan root the user picked.
import { exists, readDir, readTextFile, stat } from '@tauri-apps/plugin-fs';
import type { FileSystem } from '../board/file-system';

export const tauriFileSystem: FileSystem = {
  listDir: async (path) => (await readDir(path)).map((entry) => entry.name),
  readText: (path) => readTextFile(path),
  async stat(path) {
    const info = await stat(path);
    return { isDirectory: info.isDirectory, modifiedAt: info.mtime?.getTime() ?? 0 };
  },
  exists: (path) => exists(path),
};
