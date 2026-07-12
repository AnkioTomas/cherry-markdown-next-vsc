declare module "cherry-markdown-next/editor.css";
declare module "cherry-markdown-next/transformer.css";
declare module "cherry-markdown-next/theme/*/render.css";
declare module "cherry-markdown-next/theme/*/editor.css";

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
};

interface Window {
  __CHERRY_BOOT__?: {
    text: string;
    appearance: "light" | "dark";
    config?: {
      uploadEnabled: boolean;
      aiEnabled: boolean;
    };
    storageSnapshot?: Record<string, string>;
  };
}
