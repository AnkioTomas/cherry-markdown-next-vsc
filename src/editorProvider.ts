import * as vscode from "vscode";
import { handleAiRequest } from "./ai";
import {
  getResourceRoots,
  mergeResourceRoots,
  resolveDocumentResources,
} from "./resourceResolver";
import { readCherryConfig, toWebviewConfig } from "./settings";
import { readStorageSnapshot, writeStorageItem } from "./storage";
import { handleUpload } from "./upload";

function getNonce(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}

function buildContentSecurityPolicy(
  webview: vscode.Webview,
  nonce: string,
): string {
  const source = webview.cspSource;
  return [
    "default-src 'none'",
    `img-src ${source} https: http: data: blob:`,
    `media-src ${source} https: http: blob:`,
    `frame-src ${source} https: http:`,
    `style-src ${source} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
    `font-src ${source}`,
  ].join("; ");
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
  boot: Record<string, unknown>,
  appearance: "light" | "dark",
): string {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "dist", "webview", "main.js"),
  );
  const nonce = getNonce();

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
      padding: 0;
    }
    #cherry-root {
      width: 100%;
      height: 100%;
    }
  </style>
</head>
<body class="${appearance === "dark" ? "cherry-vscode-dark" : ""}">
  <div id="cherry-root"></div>
  <script nonce="${nonce}">window.__CHERRY_BOOT__=${JSON.stringify(boot)};</script>
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

function buildBootPayload(
  context: vscode.ExtensionContext,
  document: vscode.TextDocument,
  appearance: "light" | "dark",
) {
  const config = readCherryConfig(document.uri);
  return {
    text: document.getText(),
    appearance,
    config: toWebviewConfig(config),
    storageSnapshot: readStorageSnapshot(context),
  };
}

export class CherryEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = "cherry-markdown-next.editor";

  constructor(private readonly context: vscode.ExtensionContext) {}

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    const extensionUri = this.context.extensionUri;
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: getResourceRoots(extensionUri, document.uri),
    };

    const appearance = resolveAppearance();
    webviewPanel.webview.html = getWebviewHtml(
      webviewPanel.webview,
      extensionUri,
      buildBootPayload(this.context, document, appearance),
      appearance,
    );

    let suppressDocumentSync = false;

    const postInit = () => {
      webviewPanel.webview.postMessage({
        type: "init",
        ...buildBootPayload(this.context, document, resolveAppearance()),
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
          case "resolveResources": {
            const refs = message.refs as string[];
            const currentRoots =
              webviewPanel.webview.options.localResourceRoots ?? [];
            const { resources, missingRoots } = resolveDocumentResources(
              webviewPanel.webview,
              document.uri,
              refs,
              currentRoots,
            );
            if (missingRoots.length > 0) {
              webviewPanel.webview.options = {
                ...webviewPanel.webview.options,
                localResourceRoots: mergeResourceRoots(
                  currentRoots,
                  missingRoots,
                ),
              };
            }
            webviewPanel.webview.postMessage({
              type: "resolvedResources",
              resources,
            });
            break;
          }
          case "storageSet":
            await writeStorageItem(
              this.context,
              message.key as string,
              message.value as string,
            );
            break;
          case "openSettings":
            await vscode.commands.executeCommand(
              "workbench.action.openSettings",
              "cherryMarkdownNext",
            );
            break;
          case "uploadFile": {
            const id = message.id as number;
            try {
              const result = await handleUpload(
                document.uri,
                readCherryConfig(document.uri),
                {
                  name: message.name as string,
                  mime: message.mime as string,
                  dataBase64: message.dataBase64 as string,
                },
              );
              webviewPanel.webview.postMessage({
                type: "uploadFileResult",
                id,
                ok: true,
                ...result,
              });
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : String(error);
              void vscode.window.showErrorMessage(`上传失败: ${errorMessage}`);
              webviewPanel.webview.postMessage({
                type: "uploadFileResult",
                id,
                ok: false,
                error: errorMessage,
              });
            }
            break;
          }
          case "aiRequest": {
            const id = message.id as number;
            try {
              const result = await handleAiRequest(
                readCherryConfig(document.uri),
                message.action as string,
                message.text as string,
                message.prompts as string | undefined,
              );
              webviewPanel.webview.postMessage({
                type: "aiRequestResult",
                id,
                ok: true,
                result,
              });
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : String(error);
              void vscode.window.showErrorMessage(`AI 请求失败: ${errorMessage}`);
              webviewPanel.webview.postMessage({
                type: "aiRequestResult",
                id,
                ok: false,
                error: errorMessage,
              });
            }
            break;
          }
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
