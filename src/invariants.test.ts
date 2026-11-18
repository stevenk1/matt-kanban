// Invariants of the whole repo, checked by reading its files: the Board is read-only (no
// capability in src-tauri/capabilities/ grants an fs write, a shell command beyond the read-only
// `gh` ones, or an opener URL beyond VS Code and GitHub), and the Board reader and the views stay
// behind their seam (nothing under src/board/ or src/ui/ imports Tauri; src/shell/ holds the
// Tauri adapters), and no tracked file ties the repo to one machine (a real home folder, or a
// hard-coded folder layout under it).
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repo = fileURLToPath(new URL('..', import.meta.url));
const capabilitiesDir = join(repo, 'src-tauri', 'capabilities');

type Permission = string | { identifier: string; allow?: unknown[] };

const FS_WRITE = /write|remove|rename|mkdir|create|copy|truncate/;
const GH = /^\/(opt\/homebrew|usr\/local)\/bin\/gh$/;
const GH_ARGS: unknown[] = [
  ['issue', 'list', '--state', 'all', '--limit', '1000', '--json', 'number,title,state,labels,body,updatedAt,closedAt,url'],
  ['api', { validator: '^repos/\\{owner\\}/\\{repo\\}/issues/\\d+/sub_issues\\?per_page=100$' }],
];
const OPENER_URLS = ['vscode://file/*', 'https://github.com/*'];

/** The made-up home folders tests and fixtures may use. */
const FIXTURE_HOMES = ['dev', 'me'];
/** A home folder path; the user name is its first group. */
const HOME_PATH = /\/Users\/([\w.-]+)/g;
/** A folder layout under home that only one machine has, written as `~/x` or `$HOME/x`. */
const HOME_LAYOUT = /(?:~|\$HOME)\/repo\b/g;
const BINARY = /\.(png|icns|ico|jpg)$/;

/** What in `text` ties it to one machine: a real home folder, or a folder layout under home. */
function machineTies(text: string): string[] {
  const homes = [...text.matchAll(HOME_PATH)].filter(([, user]) => !FIXTURE_HOMES.includes(user)).map(([path]) => path);
  return [...homes, ...[...text.matchAll(HOME_LAYOUT)].map(([layout]) => layout)];
}

function trackedFiles(): string[] {
  return execFileSync('git', ['ls-files', '-z'], { cwd: repo, encoding: 'utf8' }).split('\0').filter(Boolean);
}

/** What `permission`, in the capability file `file`, grants beyond reading; empty when nothing. */
function writeAccess(file: string, permission: Permission): string[] {
  const id = typeof permission === 'string' ? permission : permission.identifier;
  const scope = typeof permission === 'string' ? [] : (permission.allow ?? []);
  const problem = (why: string) => `${file}: ${id} ${why}`;
  const [plugin, name] = id.split(':');
  if (plugin === 'fs' && (name === 'default' || FS_WRITE.test(name))) return [problem('grants fs write access')];
  if (plugin === 'shell') {
    if (name !== 'allow-execute') return [problem('is not the scoped shell:allow-execute')];
    return scope.flatMap((entry) => {
      const { cmd, args } = entry as { cmd?: unknown; args?: unknown };
      const shown = JSON.stringify(entry);
      if (typeof cmd !== 'string' || !GH.test(cmd)) return [problem(`runs something other than gh: ${shown}`)];
      if (!GH_ARGS.some((allowed) => JSON.stringify(allowed) === JSON.stringify(args)))
        return [problem(`runs gh with args other than the read-only issue list / sub_issues forms: ${shown}`)];
      return [];
    });
  }
  if (plugin === 'opener') {
    if (name !== 'allow-open-url') return [problem('is not the scoped opener:allow-open-url')];
    return scope.flatMap((entry) => {
      const { url } = entry as { url?: unknown };
      return typeof url === 'string' && OPENER_URLS.includes(url) ? [] : [problem(`opens ${JSON.stringify(entry)}`)];
    });
  }
  return [];
}

/** Every problem in the capability files' permissions. */
function capabilityProblems(files: { file: string; text: string }[]): string[] {
  return files.flatMap(({ file, text }) => {
    const capability = JSON.parse(text) as { permissions?: Permission[] };
    return (capability.permissions ?? []).flatMap((permission) => writeAccess(file, permission));
  });
}

function capabilityFiles(): { file: string; text: string }[] {
  return readdirSync(capabilitiesDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => ({ file: `src-tauri/capabilities/${name}`, text: readFileSync(join(capabilitiesDir, name), 'utf8') }));
}

/** The files under `dir` (relative to the repo) that import a Tauri package. */
function tauriImporters(dir: string): string[] {
  return readdirSync(join(repo, dir), { recursive: true, encoding: 'utf8' })
    .map((path) => join(repo, dir, path))
    .filter((path) => /\.(ts|tsx|js|jsx)$/.test(path))
    .filter((path) => /['"`]@tauri-apps\//.test(readFileSync(path, 'utf8')))
    .map((path) => relative(repo, path));
}

describe('the capabilities', () => {
  it('grant no fs write, no shell command but the read-only gh ones, and no opener URL but VS Code and GitHub', () => {
    const files = capabilityFiles();

    expect(files.length).toBeGreaterThan(0);
    expect(capabilityProblems(files), 'capabilities granting more than read-only access').toEqual([]);
  });

  it('are checked: each kind of extra access is caught', () => {
    const bad = (permission: Permission) => ({ file: 'bad.json', text: JSON.stringify({ permissions: [permission] }) });
    const gh = (cmd: string, args: unknown) => ({ identifier: 'shell:allow-execute', allow: [{ name: 'x', cmd, args }] });
    const extras: Permission[] = [
      'fs:default',
      'fs:allow-write-text-file',
      'fs:write-all',
      'fs:allow-remove',
      'fs:allow-rename',
      'fs:allow-mkdir',
      'fs:allow-copy-file',
      'fs:allow-truncate',
      'fs:allow-create',
      'shell:default',
      'shell:allow-spawn',
      gh('/bin/sh', GH_ARGS[0]),
      gh('/opt/homebrew/bin/gh', ['issue', 'close', '1']),
      gh('/opt/homebrew/bin/gh', true),
      'opener:default',
      'opener:allow-open-path',
      { identifier: 'opener:allow-open-url', allow: [{ url: 'https://*' }] },
    ];

    for (const permission of extras) expect(capabilityProblems([bad(permission)]), JSON.stringify(permission)).toHaveLength(1);
  });
});

describe('the seam', () => {
  it('keeps Tauri out of the Board reader and the views', () => {
    const importers = [...tauriImporters('src/board'), ...tauriImporters('src/ui')];

    expect(importers, 'files under src/board/ or src/ui/ importing @tauri-apps/').toEqual([]);
  });
});

describe('the tracked files', () => {
  it('hold nothing tied to one machine: no real home folder, no folder layout under home', () => {
    const ties = trackedFiles()
      .filter((file) => !BINARY.test(file))
      .flatMap((file) => machineTies(readFileSync(join(repo, file), 'utf8')).map((tie) => `${file}: ${tie}`));

    expect(ties, 'machine-specific paths in tracked files').toEqual([]);
  });

  it('are checked: a real home folder and a home layout are caught, the fixture homes are not', () => {
    const slash = '/';
    expect(machineTies(`${slash}Users${slash}someone${slash}code`)).toHaveLength(1);
    expect(machineTies(`default is ~${slash}repo`)).toHaveLength(1);
    expect(machineTies(`"$HOME${slash}repo${slash}**"`)).toHaveLength(1);
    expect(machineTies(`${slash}Users${slash}dev${slash}repo and ${slash}Users${slash}me${slash}repo${slash}alpha`)).toEqual([]);
  });
});
