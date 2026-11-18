// The file-system port the Board reader reads through. Read-only by design: it has no
// way to write, so no code path behind it can modify a scanned Project.
// Paths are absolute POSIX paths (the Board is a Mac app).

export type FileStat = { isDirectory: boolean; modifiedAt: number };

export interface FileSystem {
  /** Entry names (not paths) of a directory. */
  listDir(path: string): Promise<string[]>;
  readText(path: string): Promise<string>;
  stat(path: string): Promise<FileStat>;
  exists(path: string): Promise<boolean>;
}

export function joinPath(...parts: string[]): string {
  return parts.join('/').replace(/\/{2,}/g, '/');
}

/** `path` without trailing slashes; the root stays `/`. */
export function withoutTrailingSlash(path: string): string {
  return path.replace(/(.)\/+$/, '$1');
}

/** The last part of `path`: a Project's name is its folder's. */
export function folderName(path: string): string {
  return withoutTrailingSlash(path).split('/').pop() || path;
}

/** `path` made absolute against the folder `base` when it's relative, with `.` and `..` parts resolved. */
export function resolvePath(base: string, path: string): string {
  const parts: string[] = [];
  for (const part of (path.startsWith('/') ? path : joinPath(base, path)).split('/')) {
    if (part === '..') parts.pop();
    else if (part !== '' && part !== '.') parts.push(part);
  }
  return `/${parts.join('/')}`;
}

/** The folder `path` is in. */
export function parentOf(path: string): string {
  const trimmed = withoutTrailingSlash(path);
  return trimmed.slice(0, trimmed.lastIndexOf('/')) || '/';
}

/** Whether `path` is inside `folder`, at any depth. */
export function isInside(path: string, folder: string): boolean {
  return path.startsWith(`${withoutTrailingSlash(folder)}/`);
}
