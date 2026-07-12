import { Cherry, DEFAULT_TOOLBAR_ITEMS } from "cherry-markdown-next";
import "cherry-markdown-next/editor.css";
import "cherry-markdown-next/transformer.css";
import "./themes.css";
import "./styles.css";
import {
  bridgeRequest,
  createBridgedStorage,
  fileToBase64,
  settleBridgeResult,
} from "./bridge";
import { bindLayoutRefresh } from "./layout";
import {
  bindPreviewResourceRewrite,
  handleResolvedResources,
  scheduleResourceRewrite,
} from "./resources";

interface EditorChangePayload {
  markdown: string;
}

interface WebviewConfig {
  uploadEnabled: boolean;
  aiEnabled: boolean;
}

interface CherryBoot {
  text: string;
  appearance: "light" | "dark";
  config?: WebviewConfig;
  storageSnapshot?: Record<string, string>;
}

const SETTINGS_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" class="cherry-toolbar-icon" aria-hidden="true"><path fill="currentColor" d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7.15 7.15 0 0 0-1.62-.94l-.36-2.54A.48.48 0 0 0 14 2h-4a.48.48 0 0 0-.48.42l-.36 2.54c-.59.24-1.13.55-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.65 8.87a.49.49 0 0 0 .12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.77 14.5a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.39.3.59.22l2.39-.96c.5.39 1.03.7 1.62.94l.36 2.54c.05.24.24.42.48.42h4c.24 0 .44-.18.48-.42l.36-2.54c.59-.24 1.13-.55 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.03-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z"/></svg>`;

const vscode = acquireVsCodeApi();
const rootEl = document.getElementById("cherry-root");
if (!rootEl) {
  throw new Error("Missing #cherry-root");
}
const root: HTMLElement = rootEl;

let editor: Cherry | null = null;
let applyingExternalUpdate = false;
let unbindResourceRewrite: (() => void) | null = null;
let unbindLayoutRefresh: (() => void) | null = null;

function refreshSplitLayout(): void {
  if (!editor || editor.getLayout() !== "split") {
    return;
  }
  editor.setLayout("split");
}

function applyAppearance(appearance: "light" | "dark"): void {
  document.documentElement.classList.toggle(
    "cherry-vscode-dark",
    appearance === "dark",
  );
  document.body.classList.toggle("cherry-vscode-dark", appearance === "dark");
  editor?.theme.setLightDark(appearance);
}

function createEditor(boot: CherryBoot): void {
  const { text, appearance } = boot;
  const config: WebviewConfig = boot.config ?? {
    uploadEnabled: false,
    aiEnabled: false,
  };

  applyAppearance(appearance);

  if (editor) {
    applyingExternalUpdate = true;
    editor.setMarkdown(text);
    applyingExternalUpdate = false;
    return;
  }

  const options: Record<string, unknown> = {
    id: "vscode",
    layout: "split",
    appearance,
    themeId: "default",
    sidebar: false,
    editor: { value: text },
    storage: createBridgedStorage(
      boot.storageSnapshot ?? {},
      (message) => vscode.postMessage(message),
    ),
    toolbar: {
      items: [
        ...DEFAULT_TOOLBAR_ITEMS,
        {
          id: "vscode-settings",
          type: "button",
          label: "设置",
          title: "打开 Cherry Markdown Next 设置",
          icon: SETTINGS_ICON,
          onClick: () => {
            vscode.postMessage({ type: "openSettings" });
          },
        },
      ],
    },
  };

  if (config.uploadEnabled) {
    options.onParseFile = async (file: File) => {
      const dataBase64 = await fileToBase64(file);
      return bridgeRequest<{ url: string; msg: string }>(
        (message) => vscode.postMessage(message),
        "uploadFile",
        {
          name: file.name,
          mime: file.type,
          dataBase64,
        },
      );
    };
  }

  if (config.aiEnabled) {
    options.onAiRequest = async (
      action: string,
      selected: string,
      prompts?: string,
    ) => {
      return bridgeRequest<string>(
        (message) => vscode.postMessage(message),
        "aiRequest",
        { action, text: selected, prompts },
      );
    };
  }

  editor = new Cherry(root, options);

  unbindLayoutRefresh?.();
  unbindLayoutRefresh = bindLayoutRefresh(root, refreshSplitLayout);

  unbindResourceRewrite?.();
  unbindResourceRewrite = bindPreviewResourceRewrite(
    editor.eventBus,
    (message) => vscode.postMessage(message),
  );
  // Cherry 首次 paint 在构造函数内同步完成，上面的监听会错过 preview:rendered；
  // 立刻补扫一次，否则相对路径图片会一直打到 webview 源站 → 403。
  scheduleResourceRewrite((message) => vscode.postMessage(message));

  editor.eventBus.on("editor:change", (payload: EditorChangePayload) => {
    if (applyingExternalUpdate) {
      return;
    }
    vscode.postMessage({ type: "change", text: payload.markdown });
  });
}

window.addEventListener("message", (event) => {
  const message = event.data;
  switch (message.type) {
    case "init":
      createEditor({
        text: message.text as string,
        appearance: message.appearance as "light" | "dark",
        config: message.config as WebviewConfig | undefined,
        storageSnapshot: message.storageSnapshot as
          | Record<string, string>
          | undefined,
      });
      break;
    case "update":
      if (!editor) {
        return;
      }
      applyingExternalUpdate = true;
      editor.setMarkdown(message.text as string);
      applyingExternalUpdate = false;
      break;
    case "appearance":
      applyAppearance(message.appearance as "light" | "dark");
      break;
    case "resolvedResources":
      handleResolvedResources(message.resources as Record<string, string>);
      scheduleResourceRewrite((payload) => vscode.postMessage(payload));
      break;
    case "uploadFileResult":
      settleBridgeResult(message, (msg) => ({
        url: msg.url as string,
        msg: (msg.msg as string) || "",
      }));
      break;
    case "aiRequestResult":
      settleBridgeResult(message, (msg) => msg.result as string);
      break;
  }
});

const boot = window.__CHERRY_BOOT__;
if (boot) {
  createEditor(boot);
} else {
  vscode.postMessage({ type: "ready" });
}
