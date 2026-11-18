// The Settings window's app: loads the Settings, shows them with the Projects the Board window
// sends, and on every change saves them and, once saved, tells the Board window to read the
// Board with them. See settings-window.ts. Checked by hand.
import { useEffect, useRef, useState } from 'react';
import { messageOf } from '../board/errors';
import type { ProjectRef, Settings } from '../ui/settings';
import { SettingsView } from '../ui/SettingsView';
import { logFailure } from './log-failure';
import { loadSettings, pickScanRoot, saveSettings } from './tauri-settings';
import { useOpenAtLogin } from './use-open-at-login';
import { BOARD_WINDOW, emitToWindow, listenFor } from './window-protocol';

export function SettingsApp() {
  const [settings, setSettings] = useState<Settings | null>(null);
  /** The Settings last saved, which the Board was read with. */
  const saved = useRef<Settings | null>(null);
  /** Counts the changes, so only the latest one's save decides what shows. */
  const changes = useRef(0);
  const [projects, setProjects] = useState<ProjectRef[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [addFolderError, setAddFolderError] = useState<string | null>(null);
  const [openAtLogin, setOpenAtLogin] = useOpenAtLogin();

  useEffect(() => {
    void loadSettings().then((loaded) => {
      saved.current = loaded;
      setSettings(loaded);
    });
  }, []);

  // Settings the Board window saved (its Add Folder, while there was no scan root) are the latest.
  useEffect(() => {
    const unlisten = listenFor('settings:saved', (next) => {
      saved.current = next;
      setSettings(next);
    });
    return () => void unlisten.then((stop) => stop());
  }, []);

  useEffect(() => {
    const unlisten = listenFor('settings:projects', setProjects);
    void unlisten.then(() => emitToWindow(BOARD_WINDOW, 'settings:ready', null));
    return () => void unlisten.then((stop) => stop());
  }, []);

  if (!settings) return <p className="empty">Loading Settings…</p>;

  // The Board follows only saved Settings; when a save fails, the saved ones show again.
  const change = (next: Settings) => {
    const thisChange = ++changes.current;
    setSettings(next);
    saveSettings(next).then(
      () => {
        saved.current = next;
        if (thisChange === changes.current) setSaveError(null);
        logFailure('reach the Board window', emitToWindow(BOARD_WINDOW, 'settings:changed', next));
      },
      (error: unknown) => {
        if (thisChange !== changes.current) return;
        setSettings(saved.current);
        setSaveError(`Couldn't save the Settings: ${messageOf(error)}`);
      },
    );
  };
  const pickFolder = async () => {
    const { folder, error } = await pickScanRoot();
    setAddFolderError(error);
    return folder;
  };

  const errors = [saveError, addFolderError].filter((error): error is string => error !== null);
  return (
    <>
      <SettingsView
        settings={settings}
        projects={projects}
        openAtLogin={openAtLogin}
        onChange={change}
        onOpenAtLoginChange={setOpenAtLogin}
        pickFolder={pickFolder}
      />
      {errors.length > 0 && (
        <div className="settings-errors" role="status">
          {errors.map((error) => (
            <p key={error} className="settings-error" title={error}>
              {error}
            </p>
          ))}
        </div>
      )}
    </>
  );
}
