import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Для GitHub Pages адрес будет вида https://<логин>.github.io/<репозиторий>/,
  // поэтому пути делаем относительными.
  base: './',
  server: { port: 5173 },
  test: {
    include: ['src/**/*.test.js', 'supabase/functions/_shared/**/*.test.js'],
  },
});
