declare module "cherry-markdown-next" {
  export const DEFAULT_TOOLBAR_ITEMS: Array<{
    id: string;
    type?: string;
    label?: string;
    title?: string;
    icon?: string;
    children?: unknown[];
    onClick?: (ctx: unknown) => void;
  }>;

  export class Cherry {
    readonly theme: {
      setLightDark(mode: "light" | "dark"): void;
    };
    readonly eventBus: {
      on(
        event: "editor:change",
        handler: (payload: { markdown: string }) => void,
      ): () => void;
      on(event: "preview:rendered", handler: () => void): () => void;
      on(event: string, handler: (payload?: unknown) => void): () => void;
    };
    constructor(root: HTMLElement, options?: Record<string, unknown>);
    setMarkdown(markdown: string): void;
    getLayout(): "split" | "edit" | "preview";
    setLayout(mode: "split" | "edit" | "preview"): void;
  }
}

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
