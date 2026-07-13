declare module "cherry-markdown-next/editor.css";
declare module "cherry-markdown-next/transformer.css";
declare module "cherry-markdown-next/theme/*/render.css";
declare module "cherry-markdown-next/theme/*/editor.css";

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
};
