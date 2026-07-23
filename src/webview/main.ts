import {
  Penna,
  DEFAULT_TOOLBAR_ITEMS,
  type PennaOptions,
  type EditorOptions,
} from "penna-markdown";
import "penna-markdown/editor.css";
import "penna-markdown/transformer.css";
import "./themes.css";
import "./styles.css";
import { PennaBridge } from "./PennaBridge";

interface EditorChangePayload {
  markdown: string;
}

interface PennaBoot {
  text: string;
  appearance: "light" | "dark";
  layout: string;
  theme: string;
  statusbar: boolean;
  sidebar: boolean;
  lineNumbers: boolean;
  uploadEnabled: boolean;
  aiEnabled: boolean;
}

const SETTINGS_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" class="penna-toolbar-icon" aria-hidden="true"><path fill="currentColor" d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7.15 7.15 0 0 0-1.62-.94l-.36-2.54A.48.48 0 0 0 14 2h-4a.48.48 0 0 0-.48.42l-.36 2.54c-.59.24-1.13.55-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.65 8.87a.49.49 0 0 0 .12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.77 14.5a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.39.3.59.22l2.39-.96c.5.39 1.03.7 1.62.94l.36 2.54c.05.24.24.42.48.42h4c.24 0 .44-.18.48-.42l.36-2.54c.59-.24 1.13-.55 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.03-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z"/></svg>`;

class PennaWebviewApp {
  private readonly bridge = new PennaBridge();
  private readonly root: HTMLElement;
  private editor: Penna | null = null;
  /** 初始化 / 外部灌文期间吞掉 change，避免打开即脏 */
  private muteChange = false;

  constructor() {
    const rootEl = document.getElementById("penna-root");
    if (!rootEl) {
      throw new Error("Missing #penna-root");
    }
    this.root = rootEl;

    // Host 推送：外部改文档 / 主题切换 / 配置重建
    this.bridge.on("update", (data) => {
      const text = (data as { text?: string })?.text;
      if (typeof text === "string") {
        this.updateMarkdown(text);
      }
    });
    this.bridge.on("appearance", (data) => {
      const appearance = (data as { appearance?: "light" | "dark" })?.appearance;
      if (appearance === "light" || appearance === "dark") {
        this.applyAppearance(appearance);
      }
    });
    this.bridge.on("reconfigure", (data) => {
      this.createEditor(data as PennaBoot);
    });

    // 向 Host 要初始化数据，再创建编辑器
    void this.bridge.ask<PennaBoot>("ready").then((boot) => {
      this.createEditor(boot);
    });
  }

  private applyAppearance(appearance: "light" | "dark"): void {
    this.editor?.theme.setLightDark(appearance);
  }

  /** 双 rAF：等 Penna/CodeMirror 同步+异步 init change 刷完再放行 */
  private releaseMute(): void {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.muteChange = false;
      });
    });
  }

  private buildEditorOptions(boot: PennaBoot): EditorOptions {
    const editorOptions: EditorOptions = {
      value: boot.text,
      lineNumbers: boot.lineNumbers,
    };

    if (boot.uploadEnabled) {
      editorOptions.onParseFile = async (file) => {
        const buffer = await file.arrayBuffer();
        const dataBytes = new Uint8Array(buffer);
        return this.bridge.ask<{ url: string; msg: string }>("uploadFile", {
          name: file.name,
          mime: file.type,
          dataBytes,
        });
      };
    }

    if (boot.aiEnabled) {
      // penna-markdown ≥0.2.2：onUpdate 传增量 delta；signal 用于 Esc 取消
      editorOptions.onAiRequest = async (
        action,
        selected,
        prompts,
        onUpdate,
        signal,
      ) => {
        if (onUpdate) {
          return this.bridge.askStream<string>(
            "aiRequest",
            { action, text: selected, prompts },
            (chunk) => {
              const c = chunk as {
                contentDelta?: string;
                thinkingDelta?: string;
              };
              if (c.contentDelta || c.thinkingDelta) {
                onUpdate(c.contentDelta, c.thinkingDelta);
              }
            },
            signal,
          );
        }
        return this.bridge.ask<string>("aiRequest", {
          action,
          text: selected,
          prompts,
        });
      };
    }

    return editorOptions;
  }

  private createEditor(boot: PennaBoot): void {
    this.muteChange = true;

    if (this.editor) {
      this.editor.destroy();
      this.editor = null;
    }

    const options: PennaOptions = {
      layout: boot.layout as PennaOptions["layout"],
      appearance: boot.appearance ?? "light",
      themeId: boot.theme,
      statusbar: boot.statusbar,
      sidebar: boot.sidebar,
      toolbar: {
        items: [
          ...DEFAULT_TOOLBAR_ITEMS.filter(
            (item) => boot.aiEnabled || item.id !== "ai",
          ),
          {
            id: "vscode-settings",
            type: "button",
            label: "设置",
            title: "打开 Penna Markdown 设置",
            icon: SETTINGS_ICON,
            onClick: () => {
              this.bridge.post("openSettings");
            },
          },
        ],
      },
      preview: {
        maxWidth: "720px",
      },
      editor: this.buildEditorOptions(boot),
    };

    this.editor = new Penna(this.root, options);

    this.editor.eventBus.on("editor:change", (payload: EditorChangePayload) => {
      if (this.muteChange) {
        return;
      }
      this.bridge.post("change", { text: payload.markdown });
    });

    this.releaseMute();
  }

  private updateMarkdown(text: string): void {
    if (!this.editor) {
      return;
    }
    this.muteChange = true;
    this.editor.setMarkdown(text);
    this.releaseMute();
  }
}

new PennaWebviewApp();
