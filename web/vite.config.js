import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
  plugins: [vue()],
  root: '.',
  build: {
    outDir: resolve(__dirname, '../public'),
    emptyOutDir: false,
    assetsDir: 'assets'
  },
  server: {
    port: 5173
  }
});

