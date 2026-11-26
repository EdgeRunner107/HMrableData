import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // Windows can exclusively lock generated screenshots/audit files while QA writes them.
    watch: { ignored: ['**/tests/artifacts/**'] },
  },
});
