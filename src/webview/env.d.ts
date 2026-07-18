declare module "penna-markdown/editor.css";
declare module "penna-markdown/transformer.css";
declare module "penna-markdown/theme/*/render.css";
declare module "penna-markdown/theme/*/editor.css";

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
};
