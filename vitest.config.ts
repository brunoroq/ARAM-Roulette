import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(viteConfig, defineConfig({
  test: {
    // Vitest expands this glob itself on every OS. Node owns the .ts/.mjs suites.
    include: ['tests/**/*.test.tsx'],
  },
}));
