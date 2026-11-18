// Reads a Project's Stories: the story files, `.scratch/stories/*.md`, that an agent loop may
// keep (an optional format; see the README).
// Part of the Board reader; callers get Story values, never the files.
import type { Story } from './board';
import { messageOf } from './errors';
import { joinPath, type FileSystem } from './file-system';

const STORIES_DIR = '.scratch/stories';

export type StoryContents = {
  stories: Story[];
  /** Names what couldn't be read; the Stories that could are still returned. */
  error?: string;
};

/**
 * Every Story in `checkoutDir`, done ones included (see `isDoneStory`), in file-name order.
 * Done Stories are kept so a done copy can still win over another checkout's copy. Never throws.
 */
export async function storiesIn(checkoutDir: string, fs: FileSystem): Promise<StoryContents> {
  const dir = joinPath(checkoutDir, STORIES_DIR);
  let names: string[];
  try {
    if (!(await fs.exists(dir))) return { stories: [] };
    names = await fs.listDir(dir);
  } catch (error) {
    return { stories: [], error: `Couldn't read ${STORIES_DIR}: ${messageOf(error)}` };
  }

  const stories: Story[] = [];
  const unreadable: string[] = [];
  for (const name of names.filter((n) => n.endsWith('.md')).sort((a, b) => a.localeCompare(b))) {
    const path = joinPath(dir, name);
    try {
      stories.push(storyFrom(name.slice(0, -'.md'.length), await fs.readText(path), (await fs.stat(path)).modifiedAt));
    } catch (error) {
      unreadable.push(`${STORIES_DIR}/${name}: ${messageOf(error)}`);
    }
  }
  return unreadable.length ? { stories, error: `Couldn't read ${unreadable.join('; ')}` } : { stories };
}

/** Status `done`, in any case and with or without a note after it, e.g. `Done` or `done (merged)`. */
export function isDoneStory(story: Story): boolean {
  return /^done\b/i.test(story.status);
}

function storyFrom(slug: string, text: string, updated: number): Story {
  const { frontmatter, body } = splitFrontmatter(text.replace(/^﻿/, '').replace(/\r\n/g, '\n'));
  const sections = sectionsOf(body);
  const waiting = lineValue(sections.Next, 'Waiting:');
  return {
    slug,
    goal: frontmatter.goal || slug,
    status: frontmatter.status ?? '',
    waiting,
    step: stepOf(waiting),
    recommended: lineValue(sections.Next, 'Recommended:'),
    lastLog: lastBullet(sections.Log),
    updated,
    worktree: null,
  };
}

/** The `key: value` lines between the opening and closing `---`, and the text after. */
function splitFrontmatter(text: string): { frontmatter: Record<string, string>; body: string } {
  const lines = text.split('\n');
  const close = lines[0] === '---' ? lines.indexOf('---', 1) : -1;
  if (close === -1) return { frontmatter: {}, body: text };

  const frontmatter: Record<string, string> = {};
  for (const line of lines.slice(1, close)) {
    const match = /^([\w-]+):\s*(.*)$/.exec(line);
    if (match) frontmatter[match[1]] = match[2].trim();
  }
  return { frontmatter, body: lines.slice(close + 1).join('\n') };
}

/** The lines under each `## Heading`, by heading. */
function sectionsOf(body: string): Record<string, string[]> {
  const sections: Record<string, string[]> = {};
  let current: string[] | null = null;
  for (const line of body.split('\n')) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) sections[heading[1]] = current = [];
    else current?.push(line);
  }
  return sections;
}

/** The skill in `in-step:<skill>`, without any note after it; null when not mid-step. */
function stepOf(waiting: string | null): string | null {
  return /^in-step:\s*([^\s(]+)/.exec(waiting ?? '')?.[1] ?? null;
}

function lineValue(lines: string[] | undefined, label: string): string | null {
  const line = lines?.find((l) => l.startsWith(label));
  return line?.slice(label.length).trim() || null;
}

function lastBullet(lines: string[] | undefined): string | null {
  const bullets = lines?.filter((l) => l.startsWith('- ')) ?? [];
  return bullets.at(-1)?.slice(2).trim() ?? null;
}
