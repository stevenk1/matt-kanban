import { describe, expect, it } from 'vitest';
import { releaseAssets, tagMismatch, updaterManifest } from './release';

describe('the release tag check', () => {
  it('passes a tag that is v plus the package version', () => {
    expect(tagMismatch('v0.2.0', '0.2.0')).toBeNull();
  });

  it('refuses a tag whose version differs from the package version, naming both', () => {
    expect(tagMismatch('v0.2.1', '0.2.0')).toBe('Tag v0.2.1 is version 0.2.1, but package.json says 0.2.0.');
  });

  it('refuses a tag without the v', () => {
    expect(tagMismatch('0.2.0', '0.2.0')).toBe('Tag 0.2.0 does not start with v.');
  });
});

describe('the release assets', () => {
  it('are the .dmg, the updater bundle and its signature that tauri build leaves in the bundle folder', () => {
    expect(releaseAssets('target/bundle', '0.2.0')).toEqual({
      dmg: 'target/bundle/dmg/MattBoard_0.2.0_aarch64.dmg',
      updaterBundle: 'target/bundle/macos/MattBoard.app.tar.gz',
      signature: 'target/bundle/macos/MattBoard.app.tar.gz.sig',
    });
  });
});

describe('the updater manifest', () => {
  it("points the Apple Silicon build at the tag's .app.tar.gz, with its signature", () => {
    const manifest = updaterManifest({
      repository: 'someone/board',
      version: '0.2.0',
      signature: 'dW50cnVzdGVk\n',
      pubDate: new Date('2026-11-18T10:00:00.123Z'),
    });

    expect(manifest).toEqual({
      version: '0.2.0',
      notes: 'https://github.com/someone/board/releases/tag/v0.2.0',
      pub_date: '2026-11-18T10:00:00Z',
      platforms: {
        'darwin-aarch64': {
          signature: 'dW50cnVzdGVk',
          url: 'https://github.com/someone/board/releases/download/v0.2.0/MattBoard.app.tar.gz',
        },
      },
    });
  });
});
