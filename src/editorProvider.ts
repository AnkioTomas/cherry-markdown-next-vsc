import * as vscode from "vscode";
import {
  getResourceRoots,
  resolveDocumentResources,
} from "./resourceResolver";
import { buildContentSecurityPolicy } from "./webviewCsp";

function getNonce(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}

function resolveAppearance(): "light" | "dark" {
  const kind = vscode.window.activeColorTheme.kind;
  return kind === vscode.ColorThemeKind.Dark ||
    kind === vscode.ColorThemeKind.HighContrast
    ? "dark"
    : "light";
}

function getWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  documentText: string,
  appearance: "light" | "dark",
): string {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "dist", "webview", "main.js"),
  );
  const nonce = getNonce();
  const boot = JSON.stringify({ text: documentText, appearance });

  return `<!DOCTYPE html>
<html lang="zh-CN" class="${appearance === "dark" ? "cherry-vscode-dark" : ""}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="${appearance === "dark" ? "dark" : "light"}" />
  <meta http-equiv="Content-Security-Policy" content="${buildContentSecurityPolicy(webview, nonce)}" />
  <style>
    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: var(--vscode-editor-background, ${appearance === "dark" ? "#1e1e1e" : "#ffffff"});
      color: var(--vscode-editor-foreground, ${appearance === "dark" ? "#cccccc" : "#333333"});
    }
    #cherry-root {
      width: 100%;
      height: 100%;
    }
  </style>
</head>
<body class="${appearance === "dark" ? "cherry-vscode-dark" : ""}">
  <div id="cherry-root"></div>
  <script nonce="${nonce}">window.__CHERRY_BOOT__=${boot};</script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

async function replaceDocumentText(
  document: vscode.TextDocument,
  text: string,
): Promise<boolean> {
  const edit = new vscode.WorkspaceEdit();
  const fullRange = new vscode.Range(
    document.positionAt(0),
    document.positionAt(document.getText().length),
  );
  edit.replace(document.uri, fullRange, text);
  return vscode.workspace.applyEdit(edit);
}

export class CherryEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = "cherry-markdown-next.editor";

  constructor(private readonly extensionUri: vscode.Uri) {}

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: getResourceRoots(this.extensionUri, document.uri),
    };
    webviewPanel.webview.html = getWebviewHtml(
      webviewPanel.webview,
      this.extensionUri,
      document.getText(),
      resolveAppearance(),
    );

    let suppressDocumentSync = false;

    const postInit = () => {
      webviewPanel.webview.postMessage({
        type: "init",
        text: document.getText(),
        appearance: resolveAppearance(),
      });
    };

    const changeDocumentSubscription =
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.uri.toString() !== document.uri.toString()) {
          return;
        }
        if (suppressDocumentSync) {
          return;
        }
        webviewPanel.webview.postMessage({
          type: "update",
          text: document.getText(),
        });
      });

    const changeThemeSubscription =
      vscode.window.onDidChangeActiveColorTheme(() => {
        webviewPanel.webview.postMessage({
          type: "appearance",
          appearance: resolveAppearance(),
        });
      });

    const messageSubscription = webviewPanel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case "ready":
            postInit();
            break;
          case "change":
            suppressDocumentSync = true;
            await replaceDocumentText(document, message.text as string);
            suppressDocumentSync = false;
            break;
          case "resolveResources":
            webviewPanel.webview.postMessage({
              type: "resolvedResources",
              resources: resolveDocumentResources(
                webviewPanel.webview,
                document.uri,
                message.refs as string[],
              ),
            });
            break;
        }
      },
    );

    webviewPanel.onDidDispose(() => {
      changeDocumentSubscription.dispose();
      changeThemeSubscription.dispose();
      messageSubscription.dispose();
    });
  }
}
