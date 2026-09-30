import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ root: 'site', base: './', plugins: [react()], server: { host: '127.0.0.1', port: 4173, strictPort: true }, preview: { host: '127.0.0.1', port: 4173, strictPort: true }, build: { outDir: 'dist', emptyOutDir: true } });
