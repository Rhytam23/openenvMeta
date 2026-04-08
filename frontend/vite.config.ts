import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/state': 'http://localhost:7860',
      '/step': 'http://localhost:7860',
      '/reset': 'http://localhost:7860',
    },
  },
});
