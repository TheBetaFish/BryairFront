import { defineConfig } from "vite";

// This subproject is deployed under the repository's GitHub Pages path.
export default defineConfig({
  base: "/BryairFront/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
