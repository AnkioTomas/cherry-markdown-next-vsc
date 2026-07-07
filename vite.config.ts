import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/extension.ts"),
      formats: ["cjs"],
      fileName: () => "extension.js",
    },
    rollupOptions: {
      external: ["vscode", "path", "fs", "os", "crypto", "events"],
    },
    outDir: "dist",
    emptyOutDir: false,
    sourcemap: true,
    minify: false,
  },
});
