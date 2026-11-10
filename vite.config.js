import { defineConfig } from "vite";

export default defineConfig({
  root: "public",
  base: "/",
  publicDir: false,
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    target: "es2022",
    sourcemap: true,
  },
  server: {
    proxy: {
      "/api": "http://localhost:4173",
    },
  },
});
