import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["extensions/aarla-promotions/tests/**/*.test.js"],
  },
});
