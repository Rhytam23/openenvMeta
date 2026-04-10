import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

const rootDir = process.cwd();
const tempDir = path.join(rootDir, '.vite-build');
const distDir = path.join(rootDir, 'dist');

rmSync(tempDir, { recursive: true, force: true });
rmSync(distDir, { recursive: true, force: true });

execSync('tsc -p tsconfig.build.json', { stdio: 'inherit' });

mkdirSync(tempDir, { recursive: true });
const indexHtml = readFileSync(path.join(rootDir, 'index.html'), 'utf8').replace('/src/main.tsx', './main.js');
writeFileSync(path.join(tempDir, 'index.html'), indexHtml);

await build({
  configFile: false,
  root: tempDir,
  plugins: [react()],
  resolve: {
    preserveSymlinks: true,
  },
  build: {
    outDir: distDir,
    emptyOutDir: true,
    target: 'esnext',
    minify: false,
    cssMinify: false,
  },
});

rmSync(tempDir, { recursive: true, force: true });
