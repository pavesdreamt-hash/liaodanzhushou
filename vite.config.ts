import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'ui',
  base: './',
  plugins: [react()],
  build: {
    outDir: '../renderer',
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        entryFileNames: 'app.js',
        chunkFileNames: 'chunk-[name].js',
        assetFileNames: asset => asset.name?.endsWith('.css') ? 'app.css' : 'asset-[name][extname]'
      }
    }
  }
});
