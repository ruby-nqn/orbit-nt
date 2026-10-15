import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    sourcemap: true,
    rollupOptions: {
      input: { newtab: 'index.html', background: 'src/background.ts' },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'background'
            ? 'background.js'
            : 'assets/[name]-[hash].js',
      },
    },
  },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
