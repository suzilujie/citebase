import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The SPA lives in web/, the built bundle lands in public/ and is served by the
// Bun API on a single port, so a customer only needs one URL.
export default defineConfig({
  root: 'web',
  plugins: [react()],
  server: {
    port: 5177,
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/api': 'http://localhost:15640',
    },
  },
  build: {
    outDir: '../public',
    emptyOutDir: true,
  },
});
