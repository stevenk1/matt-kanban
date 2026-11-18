// Open at login, for the popover and the Settings window: asked of macOS through the autostart
// plugin, which registers a Launch Agent. Checked by hand (spec, "Thin Tauri shell").
import { getCurrentWindow } from '@tauri-apps/api/window';
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart';
import { useEffect, useState } from 'react';
import { logFailure } from './log-failure';

/**
 * Whether the app opens at login (null until macOS has said), asked again whenever this window
 * gains focus, as the other window may have changed it; and the function that turns it on or off.
 */
export function useOpenAtLogin(): [boolean | null, (on: boolean) => void] {
  const [openAtLogin, setOpenAtLogin] = useState<boolean | null>(null);

  useEffect(() => {
    const check = () => logFailure('check Open at login', isEnabled().then(setOpenAtLogin));
    check();
    const listening = getCurrentWindow().onFocusChanged(({ payload: focused }) => focused && check());
    return () => void listening.then((stopListening) => stopListening());
  }, []);

  const turn = (on: boolean) =>
    logFailure(
      `turn Open at login ${on ? 'on' : 'off'}`,
      (on ? enable() : disable()).finally(() => isEnabled().then(setOpenAtLogin)),
    );
  return [openAtLogin, turn];
}
