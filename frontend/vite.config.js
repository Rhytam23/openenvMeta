import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/state': 'http://localhost:8000',
      '/step': 'http://localhost:8000',
      '/reset': 'http://localhost:8000',
    },
  },
});
