// Explicit ESM for the test config; the extension package stays CommonJS.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/test/**/*.test.ts'],
    // Don't try to resolve vscode module — it's provided at runtime
    server: {
      deps: {
        external: ['vscode'],
      },
    },
  },
});
