import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Deliberately do not output into src/www until the replacement is validated.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/admin/api': { target: process.env.EPUSDT_BACKEND || 'http://127.0.0.1:8000', changeOrigin: true } } },
  build: { outDir: 'dist' },
});
