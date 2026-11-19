// The Settings window's content (seam 2): the scan roots, which Projects show on the Board, the
// Done window and Open at login. It edits the Settings it is given and hands every change back;
// the shell saves them and has the Board read again. Picking a folder and Open at login are the
// shell's, passed in.
import { useEffect, useId, useState } from 'react';
import { folderName, isInside } from '../board/file-system';
import {
  isDoneWindow,
  MAX_DONE_WINDOW_DAYS,
  MIN_DONE_WINDOW_DAYS,
  withScanRoot,
  type ProjectRef,
  type Settings,
} from './settings';
import './push-button.css';
import './settings-view.css';

type Props = {
  settings: Settings;
  /** The Projects on the Board, so hidden ones aren't among them. */
  projects: ProjectRef[];
  /** Whether the app opens at login; null until that is known. */
  openAtLogin: boolean | null;
  onChange: (settings: Settings) => void;
  onOpenAtLoginChange: (on: boolean) => void;
  /** Asks for a folder to add as a scan root; null when the user cancels. */
  pickFolder: () => Promise<string | null>;
};

export function SettingsView({ settings, projects, openAtLogin, onChange, onOpenAtLoginChange, pickFolder }: Props) {
  const { scanRoots, hiddenProjects } = settings;
  const hidden = new Set(hiddenProjects);

  const addScanRoot = async () => {
    const folder = await pickFolder();
    const next = folder ? withScanRoot(settings, folder) : settings;
    if (next !== settings) onChange(next);
  };
  // A hidden Project in a removed scan root is forgotten: it is no longer found to show again.
  const removeScanRoot = (root: string) =>
    onChange({
      ...settings,
      scanRoots: scanRoots.filter((r) => r !== root),
      hiddenProjects: hiddenProjects.filter((dir) => !isInside(dir, root)),
    });
  const setShown = (dir: string, shown: boolean) =>
    onChange({
      ...settings,
      hiddenProjects: shown ? hiddenProjects.filter((d) => d !== dir) : [...hiddenProjects, dir],
    });

  return (
    <form className="settings" onSubmit={(event) => event.preventDefault()}>
      <section className="settings-section">
        <h2 id="scan-roots">Scan roots</h2>
        <p className="settings-help">Every folder in these with docs/agents/issue-tracker.md is a Project.</p>
        <ul className="settings-box settings-roots" aria-labelledby="scan-roots">
          {scanRoots.map((root) => (
            <li key={root}>
              <span className="settings-path" title={root}>
                {root}
              </span>
              <button
                type="button"
                className="push-button settings-remove"
                aria-label={`Remove ${root}`}
                title="Remove"
                onClick={() => removeScanRoot(root)}
              >
                −
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="push-button" onClick={() => void addScanRoot()}>
          Add Folder…
        </button>
      </section>

      <fieldset className="settings-section">
        <legend>
          <h2>Show in MattBoard</h2>
        </legend>
        <ul className="settings-box settings-projects">
          {listedProjects(projects, hiddenProjects).map(({ name, dir }) => (
            <li key={dir}>
              <label title={dir}>
                <input type="checkbox" checked={!hidden.has(dir)} onChange={(event) => setShown(dir, event.target.checked)} />
                {name}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <section className="settings-section">
        <h2>Done Tickets</h2>
        <DoneWindowField days={settings.doneWindowDays} onChange={(doneWindowDays) => onChange({ ...settings, doneWindowDays })} />
      </section>

      <section className="settings-section">
        <label className="settings-check">
          <input
            type="checkbox"
            checked={openAtLogin ?? false}
            disabled={openAtLogin === null}
            onChange={(event) => onOpenAtLoginChange(event.target.checked)}
          />
          Open at login
        </label>
        <p className="settings-help">Keeps the Ready count in the menu bar from the moment you log in.</p>
      </section>
    </form>
  );
}

/** The Done window, kept while what is typed isn't a valid number of days. */
function DoneWindowField({ days, onChange }: { days: number; onChange: (days: number) => void }) {
  const id = useId();
  const [draft, setDraft] = useState(String(days));
  useEffect(() => setDraft(String(days)), [days]);

  return (
    <p className="settings-row">
      <label htmlFor={id}>Done window</label>
      <input
        id={id}
        type="number"
        min={MIN_DONE_WINDOW_DAYS}
        max={MAX_DONE_WINDOW_DAYS}
        step={1}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          const next = Number(event.target.value);
          if (event.target.value !== '' && isDoneWindow(next) && next !== days) onChange(next);
        }}
        onBlur={() => setDraft(String(days))}
      />
      <span className="settings-help">days in the mini-board's Done column</span>
    </p>
  );
}

/** The Projects on the Board and the hidden ones, by name; a hidden one is named by its folder. */
function listedProjects(projects: ProjectRef[], hiddenProjects: string[]): ProjectRef[] {
  const listed = new Map(projects.map((project) => [project.dir, project]));
  for (const dir of hiddenProjects) {
    if (!listed.has(dir)) listed.set(dir, { name: folderName(dir), dir });
  }
  return [...listed.values()].sort((a, b) => a.name.localeCompare(b.name) || a.dir.localeCompare(b.dir));
}
