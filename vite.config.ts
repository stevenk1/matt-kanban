/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// This checkout's own .claude/ (agent worktrees live there). Not '**/.claude/**', which
// would also match every file when this config runs inside an agent worktree.
const ownClaudeDir = fileURLToPath(new URL('./.claude/', import.meta.url));
import react from '@vitejs/plugin-react';

// Port 1420 is what src-tauri/tauri.conf.json's devUrl points at.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ['**/src-tauri/**', `${ownClaudeDir}**`] } },
  // Three pages: the Board window, the menu-bar popover window (see src-tauri/tauri.conf.json) and
  // the Settings window (opened by src-tauri/src/settings.rs).
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        popover: fileURLToPath(new URL('./popover.html', import.meta.url)),
        settings: fileURLToPath(new URL('./settings.html', import.meta.url)),
      },
    },
  },
  test: {
    // Test files import describe/it/expect from 'vitest'; src/test-setup.ts registers
    // Testing Library's cleanup, which it can't do on its own without globals.
    globals: false,
    setupFiles: ['src/test-setup.ts'],
    // Agent worktrees live under .claude/worktrees/ with their own copy of the tests.
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
});
