// The release workflow's tag check and its updater manifest (.github/workflows/release.yml, ADR
// 0002), run by Node straight from TypeScript, from the repo root:
//
//   node scripts/release.ts check-tag <tag>
//     fails unless <tag> is v + package.json's version.
//   node scripts/release.ts manifest <bundle folder> <out>
//     writes the updater's latest.json to <out> and prints the Release's assets, one path per line:
//     the .dmg, the updater bundle, its signature and <out>. Fails if tauri build didn't make one.
//
// `manifest` reads the repository (owner/name) from GITHUB_REPOSITORY, which Actions sets.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** productName in tauri.conf.json, which names the bundles tauri build makes. */
const PRODUCT = 'MattBoard';
const ARCH = 'aarch64';

/** Why `tag` can't release package.json's `version`, or null when it is `v<version>`. */
export function tagMismatch(tag: string, version: string): string | null {
  if (!tag.startsWith('v')) return `Tag ${tag} does not start with v.`;
  const tagged = tag.slice(1);
  return tagged === version ? null : `Tag ${tag} is version ${tagged}, but package.json says ${version}.`;
}

/** Where `tauri build --target aarch64-apple-darwin` leaves the files a Release of `version` carries. */
export function releaseAssets(bundle: string, version: string) {
  const updaterBundle = join(bundle, 'macos', `${PRODUCT}.app.tar.gz`);
  return {
    dmg: join(bundle, 'dmg', `${PRODUCT}_${version}_${ARCH}.dmg`),
    updaterBundle,
    signature: `${updaterBundle}.sig`,
  };
}

/** The latest.json the updater reads: where the Apple Silicon build of `version` is, and its signature. */
export function updaterManifest(release: { repository: string; version: string; signature: string; pubDate: Date }) {
  const releases = `https://github.com/${release.repository}/releases`;
  const tag = `v${release.version}`;
  const download = basename(releaseAssets('', release.version).updaterBundle);
  return {
    version: release.version,
    notes: `${releases}/tag/${tag}`,
    // RFC 3339 without milliseconds, as the updater's examples write it.
    pub_date: release.pubDate.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    platforms: {
      [`darwin-${ARCH}`]: { signature: release.signature.trim(), url: `${releases}/download/${tag}/${download}` },
    },
  };
}

function packageVersion(): string {
  return (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function main([command, ...args]: string[]) {
  if (command === 'check-tag' && args.length === 1) {
    const problem = tagMismatch(args[0], packageVersion());
    if (problem) fail(problem);
    return;
  }
  if (command === 'manifest' && args.length === 2) {
    const repository = process.env.GITHUB_REPOSITORY ?? fail('GITHUB_REPOSITORY is not set.');
    const [bundle, out] = args;
    const version = packageVersion();
    const files = releaseAssets(bundle, version);
    const assets = Object.values(files);
    const missing = assets.filter((path) => !existsSync(path));
    if (missing.length > 0) fail(`tauri build didn't make: ${missing.join(', ')}`);
    const manifest = updaterManifest({
      repository,
      version,
      signature: readFileSync(files.signature, 'utf8'),
      pubDate: new Date(),
    });
    writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log([...assets, out].join('\n'));
    return;
  }
  fail('Usage: node scripts/release.ts check-tag <tag> | manifest <bundle folder> <out>');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
