import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    outDir: "dist/webview",
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, "src/webview/main.ts"),
      output: {
        format: "iife",
        name: "PennaMarkdownWebview",
        entryFileNames: "main.js",
        assetFileNames: "main.[ext]",
        inlineDynamicImports: true,
      },
    },
    sourcemap: false,
    minify: false,
  },
});
