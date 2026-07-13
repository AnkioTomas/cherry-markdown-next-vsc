import { builtinModules } from "module";
import { resolve } from "path";
import { defineConfig } from "vite";

const nodeExternals = new Set([
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
]);

function isNodeExternal(id: string): boolean {
  if (id === "vscode") {
    return true;
  }
  if (nodeExternals.has(id)) {
    return true;
  }
  // fs/promises、stream/consumers 等子路径
  const base = id.startsWith("node:") ? id.slice(5).split("/")[0] : id.split("/")[0];
  return nodeExternals.has(base) || nodeExternals.has(`node:${base}`);
}

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/extension.ts"),
      formats: ["cjs"],
      fileName: () => "extension.js",
    },
    rollupOptions: {
      external: isNodeExternal,
    },
    target: "node18",
    outDir: "dist",
    emptyOutDir: false,
    sourcemap: true,
    minify: false,
    ssr: true,
  },
  resolve: {
    conditions: ["node"],
    mainFields: ["module", "jsnext:main", "jsnext"],
  },
});
