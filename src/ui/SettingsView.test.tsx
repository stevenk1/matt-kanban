// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ProjectRef, Settings } from './settings';
import { SettingsView } from './SettingsView';

const settings: Settings = {
  scanRoots: ['/Users/dev/repo', '/Users/dev/work'],
  hiddenProjects: ['/Users/dev/repo/dormant'],
  doneWindowDays: 14,
};

const projects: ProjectRef[] = [
  { name: 'alpha', dir: '/Users/dev/repo/alpha' },
  { name: 'gamma', dir: '/Users/dev/work/gamma' },
];

function renderSettings({
  given = settings,
  openAtLogin = false as boolean | null,
  picked = null as string | null,
} = {}) {
  const onChange = vi.fn<(settings: Settings) => void>();
  const onOpenAtLoginChange = vi.fn<(on: boolean) => void>();
  const pickFolder = vi.fn(async () => picked);
  render(
    <SettingsView
      settings={given}
      projects={projects}
      openAtLogin={openAtLogin}
      onChange={onChange}
      onOpenAtLoginChange={onOpenAtLoginChange}
      pickFolder={pickFolder}
    />,
  );
  return { onChange, onOpenAtLoginChange, pickFolder, user: userEvent.setup() };
}

function scanRootsShown() {
  return within(screen.getByRole('list', { name: 'Scan roots' }))
    .getAllByRole('listitem')
    .map((item) => within(item).getByText(/^\//).textContent);
}

describe('SettingsView: scan roots', () => {
  it('lists the scan roots', () => {
    renderSettings();

    expect(scanRootsShown()).toEqual(['/Users/dev/repo', '/Users/dev/work']);
  });

  it('adds the folder picked from "Add Folder…"', async () => {
    const { onChange, pickFolder, user } = renderSettings({ picked: '/Users/dev/side' });

    await user.click(screen.getByRole('button', { name: 'Add Folder…' }));

    expect(pickFolder).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      ...settings,
      scanRoots: ['/Users/dev/repo', '/Users/dev/work', '/Users/dev/side'],
    });
  });

  it('adds nothing when the picker is cancelled', async () => {
    const { onChange, user } = renderSettings({ picked: null });

    await user.click(screen.getByRole('button', { name: 'Add Folder…' }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('adds nothing when the picked folder is already a scan root', async () => {
    const { onChange, user } = renderSettings({ picked: '/Users/dev/work' });

    await user.click(screen.getByRole('button', { name: 'Add Folder…' }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('removes a scan root, and forgets the hidden Projects in it', async () => {
    const { onChange, user } = renderSettings();

    await user.click(screen.getByRole('button', { name: 'Remove /Users/dev/repo' }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...settings, scanRoots: ['/Users/dev/work'], hiddenProjects: [] });
  });

  it('removes the last scan root too, leaving none until another is picked', async () => {
    const { onChange, user } = renderSettings({ given: { ...settings, scanRoots: ['/Users/dev/repo'] } });

    await user.click(screen.getByRole('button', { name: 'Remove /Users/dev/repo' }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...settings, scanRoots: [], hiddenProjects: [] });
  });
});

describe('SettingsView: hidden Projects', () => {
  it('lists every Project found, shown ones ticked, and a hidden one by its folder name, unticked', () => {
    renderSettings();

    const group = screen.getByRole('group', { name: 'Show in MattBoard' });
    const boxes = within(group)
      .getAllByRole('checkbox')
      .map((box) => [box.closest('label')?.textContent, (box as HTMLInputElement).checked]);
    expect(boxes).toEqual([
      ['alpha', true],
      ['dormant', false],
      ['gamma', true],
    ]);
  });

  it('hides a Project when it is unticked', async () => {
    const { onChange, user } = renderSettings();

    await user.click(screen.getByRole('checkbox', { name: 'gamma' }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      ...settings,
      hiddenProjects: ['/Users/dev/repo/dormant', '/Users/dev/work/gamma'],
    });
  });

  it('shows a hidden Project again when it is ticked', async () => {
    const { onChange, user } = renderSettings();

    await user.click(screen.getByRole('checkbox', { name: 'dormant' }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...settings, hiddenProjects: [] });
  });
});

describe('SettingsView: Done window', () => {
  it('shows the Done window in days, and changes it', async () => {
    const { onChange, user } = renderSettings();

    const days = screen.getByRole('spinbutton', { name: 'Done window' });
    expect(days).toHaveValue(14);
    await user.clear(days);
    await user.type(days, '7');

    expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...settings, doneWindowDays: 7 });
  });

  it('keeps the Done window while what is typed is not a whole number of days from 1 to 365', async () => {
    const { onChange, user } = renderSettings();

    const days = screen.getByRole('spinbutton', { name: 'Done window' });
    await user.clear(days);
    await user.type(days, '0');
    await user.clear(days);
    await user.type(days, '-3');
    await user.clear(days);
    await user.paste('400');

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('SettingsView: Open at login', () => {
  it('shows Open at login off, and turns it on', async () => {
    const { onOpenAtLoginChange, onChange, user } = renderSettings({ openAtLogin: false });

    const box = screen.getByRole('checkbox', { name: 'Open at login' });
    expect(box).not.toBeChecked();
    await user.click(box);

    expect(onOpenAtLoginChange).toHaveBeenCalledExactlyOnceWith(true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows Open at login on, and turns it off', async () => {
    const { onOpenAtLoginChange, user } = renderSettings({ openAtLogin: true });

    await user.click(screen.getByRole('checkbox', { name: 'Open at login', checked: true }));

    expect(onOpenAtLoginChange).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('cannot be changed until it is known whether it is on', () => {
    renderSettings({ openAtLogin: null });

    expect(screen.getByRole('checkbox', { name: 'Open at login' })).toBeDisabled();
  });
});
