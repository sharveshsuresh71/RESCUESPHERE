import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      input: {
        main: 'index.html',
        app: 'app.html',
        viewer: 'viewer.html',
        training: 'training.html'
      }
    }
  },
  server: {
    https: false,
    host: true
  }
});
