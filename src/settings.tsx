// The Settings window's entry (settings.html); the Board window's is main.tsx.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SettingsApp } from './shell/SettingsApp';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SettingsApp />
  </StrictMode>,
);
