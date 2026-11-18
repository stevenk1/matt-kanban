// The menu-bar popover window's entry (popover.html); the Board window's is main.tsx.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PopoverApp } from './shell/PopoverApp';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PopoverApp />
  </StrictMode>,
);
