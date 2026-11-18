import { describe, expect, it } from 'vitest';
import { settingsFromFile } from './settings';

describe('settingsFromFile', () => {
  it('gives the defaults when nothing was saved: no scan root until one is picked, nothing hidden, a 14-day Done window', () => {
    expect(settingsFromFile(null)).toEqual({
      scanRoots: [],
      hiddenProjects: [],
      doneWindowDays: 14,
    });
  });

  it('keeps what was saved', () => {
    const saved = JSON.stringify({
      scanRoots: ['/Users/dev/repo', '/Users/dev/work'],
      hiddenProjects: ['/Users/dev/repo/dormant'],
      doneWindowDays: 30,
    });

    expect(settingsFromFile(saved)).toEqual({
      scanRoots: ['/Users/dev/repo', '/Users/dev/work'],
      hiddenProjects: ['/Users/dev/repo/dormant'],
      doneWindowDays: 30,
    });
  });

  it('fills in a setting the saved file lacks with its default', () => {
    const saved = JSON.stringify({ hiddenProjects: ['/Users/dev/repo/dormant'] });

    expect(settingsFromFile(saved)).toEqual({
      scanRoots: [],
      hiddenProjects: ['/Users/dev/repo/dormant'],
      doneWindowDays: 14,
    });
  });

  it('drops scan roots and hidden Projects that are not absolute folders, and repeats, and trailing slashes', () => {
    const saved = JSON.stringify({
      scanRoots: ['/Users/dev/work/', 'relative/path', 42, '/Users/dev/work', ''],
      hiddenProjects: ['/Users/dev/work/old/', null, '/Users/dev/work/old', '~/dormant'],
    });

    expect(settingsFromFile(saved)).toMatchObject({
      scanRoots: ['/Users/dev/work'],
      hiddenProjects: ['/Users/dev/work/old'],
    });
  });

  it('has no scan root when none saved is usable', () => {
    const saved = JSON.stringify({ scanRoots: ['relative'] });

    expect(settingsFromFile(saved).scanRoots).toEqual([]);
  });

  it.each([0, -3, 2.5, 'seven', 10_000])('falls back to 14 days for a Done window of %j', (doneWindowDays) => {
    const saved = JSON.stringify({ doneWindowDays });

    expect(settingsFromFile(saved).doneWindowDays).toBe(14);
  });

  it.each(['not json', '[1, 2]', '"text"', 'null'])('gives the defaults for an unreadable file: %s', (text) => {
    expect(settingsFromFile(text)).toEqual({
      scanRoots: [],
      hiddenProjects: [],
      doneWindowDays: 14,
    });
  });
});
