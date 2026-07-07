import { Cherry } from "cherry-markdown-next";
import "cherry-markdown-next/editor.css";
import "cherry-markdown-next/transformer.css";
import "./themes.css";
import "./styles.css";

interface EditorChangePayload {
  markdown: string;
}

const vscode = acquireVsCodeApi();
const rootEl = document.getElementById("cherry-root");
if (!rootEl) {
  throw new Error("Missing #cherry-root");
}
const root: HTMLElement = rootEl;

let editor: Cherry | null = null;
let applyingExternalUpdate = false;

function createEditor(text: string, appearance: "light" | "dark"): void {
  editor?.destroy();
  root.replaceChildren();

  editor = new Cherry(root, {
    id: "vscode",
    layout: "split",
    appearance,
    themeId: "default",
    sidebar: false,
    editor: { value: text },
  });

  editor.theme.on("editor:change", (payload: EditorChangePayload) => {
    if (applyingExternalUpdate) {
      return;
    }
    vscode.postMessage({ type: "change", text: payload.markdown });
  });
}

function setAppearance(appearance: "light" | "dark"): void {
  editor?.theme.setLightDark(appearance);
  document.body.classList.toggle("cherry-vscode-dark", appearance === "dark");
}

window.addEventListener("message", (event) => {
  const message = event.data;
  switch (message.type) {
    case "init":
      createEditor(message.text as string, message.appearance as "light" | "dark");
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
      setAppearance(message.appearance as "light" | "dark");
      break;
  }
});

vscode.postMessage({ type: "ready" });
