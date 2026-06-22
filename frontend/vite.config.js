import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// On GitHub Pages the app is served from /<repo>/, so use that base for the
// production build. Dev stays at root for convenience.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/Mathit_Management_System/' : '/',
  server: { port: 5173, host: true },
}));
