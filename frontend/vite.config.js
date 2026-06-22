import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' so the built site works when served from any path.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 5173, host: true },
});
