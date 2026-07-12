import { Cherry } from "cherry-markdown-next";
import "cherry-markdown-next/editor.css";
import "cherry-markdown-next/transformer.css";
import "./themes.css";
import "./styles.css";
import {
  bindPreviewResourceRewrite,
  handleResolvedResources,
  scheduleResourceRewrite,
} from "./resources";
import { bindLayoutRefresh, resetSplitRatio } from "./layout";

interface EditorChangePayload {
  markdown: string;
}

interface CherryBoot {
  text: string;
  appearance: "light" | "dark";
}

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

function createEditor(text: string, appearance: "light" | "dark"): void {
  applyAppearance(appearance);

  if (editor) {
    applyingExternalUpdate = true;
    editor.setMarkdown(text);
    applyingExternalUpdate = false;
    return;
  }

  resetSplitRatio();

  editor = new Cherry(root, {
    id: "vscode",
    layout: "split",
    appearance,
    themeId: "default",
    sidebar: false,
    editor: { value: text },
  });

  unbindLayoutRefresh?.();
  unbindLayoutRefresh = bindLayoutRefresh(root, refreshSplitLayout);

  unbindResourceRewrite?.();
  unbindResourceRewrite = bindPreviewResourceRewrite(
    editor.theme,
    (message) => vscode.postMessage(message),
  );

  editor.theme.on("editor:change", (payload: EditorChangePayload) => {
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
      createEditor(
        message.text as string,
        message.appearance as "light" | "dark",
      );
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
  }
});

const boot = window.__CHERRY_BOOT__;
if (boot) {
  createEditor(boot.text, boot.appearance);
} else {
  vscode.postMessage({ type: "ready" });
}
