import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backend = process.env.EPUSDT_BACKEND || 'http://127.0.0.1:8000';
// Only development proxying changes; production Go embed remains src/www.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/admin/api': { target: backend, changeOrigin: true },
      // Regex matching avoids proxying the real SPA route /payment-setup.
      '^/pay/': { target: backend, changeOrigin: true },
      '^/payments/': { target: backend, changeOrigin: true },
    },
  },
  build: { outDir: 'dist' },
});
