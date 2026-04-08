import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  css: {
    // Disable PostCSS/Tailwind processing in tests — not needed for unit tests
    // and avoids the ts-node requirement for postcss.config.ts
    postcss: {},
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
  },
});
