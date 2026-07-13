import * as vscode from "vscode";
import { CherryAi } from "./CherryAi";
import { CherryConfig, type UploadMode } from "./CherryConfig";
import { CherryUploader } from "./CherryUploader";
import {
  type ExtMessage,
  extError,
  extResponse,
} from "../webview/CherryBridge";

/** Host → Webview 的编辑器启动/重建载荷 */
export interface CherryBootPayload {
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

/**
 * Webview 可加载的本地根目录：扩展目录 + 文档目录 + 工作区。
 * 相对路径靠 HTML `<base href=asWebviewUri(docDir)>` 解析，不需要事后扫 DOM。
 */
function collectLocalResourceRoots(
  extensionUri: vscode.Uri,
  documentUri: vscode.Uri,
): vscode.Uri[] {
  const roots = new Map<string, vscode.Uri>();
  roots.set(extensionUri.toString(), extensionUri);

  const docDir = vscode.Uri.joinPath(documentUri, "..");
  roots.set(docDir.toString(), docDir);

  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    roots.set(folder.uri.toString(), folder.uri);
  }
  return [...roots.values()];
}

/** 文档旁目录的 webview base（必须带尾斜杠，否则最后一段会被吃掉） */
function documentBaseHref(
  webview: vscode.Webview,
  documentUri: vscode.Uri,
): string {
  const docDir = vscode.Uri.joinPath(documentUri, "..");
  return `${webview.asWebviewUri(docDir).toString().replace(/\/?$/, "/")}`;
}

function escapeHtmlAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/**
 * Cherry Markdown 的自定义编辑器提供程序。
 * 负责管理 Webview 的生命周期、文档同步以及与前端插件的 IPC 通信。
 */
export class CherryEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = "cherry-markdown-next.editor";

  constructor(private readonly context: vscode.ExtensionContext) {}

  /**
   * 解析并初始化自定义编辑器。
   * 每个打开的 Markdown 文档都会触发此方法，利用闭包隔离各自的状态。
   */
  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    const disposables: vscode.Disposable[] = [];
    let suppressDocumentSync = false;
    let config = new CherryConfig(document.uri);
    const extensionUri = this.context.extensionUri;

    const isUploadEnabled = (): boolean => {
      const mode = config.getItem<UploadMode>("upload.mode", "off");
      if (mode === "off") {
        return false;
      }
      if (mode === "script") {
        return Boolean(config.getItem<string>("upload.script", "").trim());
      }
      return true;
    };

    const buildBoot = (): CherryBootPayload => ({
      text: document.getText(),
      appearance: this.resolveAppearance(),
      layout: config.getItem<string>("ui.layout", "split"),
      theme: config.getItem<string>("ui.theme", "default"),
      statusbar: config.getItem<boolean>("ui.statusbar", true),
      sidebar: config.getItem<boolean>("ui.sidebar", true),
      lineNumbers: config.getItem<boolean>("ui.lineNumbers", true),
      uploadEnabled: isUploadEnabled(),
      aiEnabled: config.getItem<boolean>("ai.enabled", false),
    });

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: collectLocalResourceRoots(extensionUri, document.uri),
    };

    webviewPanel.webview.html = this.getWebviewHtml(
      webviewPanel.webview,
      extensionUri,
      document.uri,
    );

    vscode.workspace.onDidChangeTextDocument(
      (event) => {
        if (
          event.document.uri.toString() !== document.uri.toString() ||
          suppressDocumentSync
        ) {
          return;
        }
        webviewPanel.webview.postMessage({
          command: "update",
          data: { text: document.getText() },
        } satisfies ExtMessage);
      },
      null,
      disposables,
    );

    vscode.window.onDidChangeActiveColorTheme(
      () => {
        webviewPanel.webview.postMessage({
          command: "appearance",
          data: { appearance: this.resolveAppearance() },
        } satisfies ExtMessage);
      },
      null,
      disposables,
    );

    vscode.workspace.onDidChangeConfiguration(
      (event) => {
        if (!event.affectsConfiguration("cherryMarkdownNext", document.uri)) {
          return;
        }
        config = new CherryConfig(document.uri);
        webviewPanel.webview.postMessage({
          command: "reconfigure",
          data: buildBoot(),
        } satisfies ExtMessage);
      },
      null,
      disposables,
    );

    webviewPanel.webview.onDidReceiveMessage(
      async (raw: ExtMessage) => {
        const data = (raw.data ?? {}) as Record<string, any>;
        switch (raw.command) {
          case "ready":
            extResponse(raw, buildBoot(), webviewPanel.webview);
            break;

          case "change": {
            const next = data.text as string;
            // 相同内容绝不 applyEdit，否则打开文件就会被标脏
            if (typeof next !== "string" || next === document.getText()) {
              break;
            }
            suppressDocumentSync = true;
            try {
              const edit = new vscode.WorkspaceEdit();
              edit.replace(
                document.uri,
                new vscode.Range(
                  document.positionAt(0),
                  document.positionAt(document.getText().length),
                ),
                next,
              );
              await vscode.workspace.applyEdit(edit);
            } finally {
              suppressDocumentSync = false;
            }
            break;
          }

          case "openSettings":
            await vscode.commands.executeCommand(
              "workbench.action.openSettings",
              "cherryMarkdownNext",
            );
            break;

          case "uploadFile":
            try {
              const uploader = new CherryUploader(document.uri, config);
              const result = await uploader.upload({
                name: data.name as string,
                mime: data.mime as string,
                dataBase64: data.dataBase64 as string,
              });
              extResponse(raw, result, webviewPanel.webview);
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : String(error);
              void vscode.window.showErrorMessage(`上传失败: ${errorMessage}`);
              extError(raw, errorMessage, webviewPanel.webview);
            }
            break;

          case "aiRequest":
            try {
              const result = await new CherryAi(config).request(
                data.action as string,
                data.text as string,
                data.prompts as string | undefined,
              );
              extResponse(raw, result, webviewPanel.webview);
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : String(error);
              void vscode.window.showErrorMessage(
                `AI 请求失败: ${errorMessage}`,
              );
              extError(raw, errorMessage, webviewPanel.webview);
            }
            break;
        }
      },
      null,
      disposables,
    );

    webviewPanel.onDidDispose(
      () => disposables.forEach((d) => d.dispose()),
      null,
      disposables,
    );
  }

  private resolveAppearance(): "light" | "dark" {
    const kind = vscode.window.activeColorTheme.kind;
    return kind === vscode.ColorThemeKind.Dark ||
      kind === vscode.ColorThemeKind.HighContrast
      ? "dark"
      : "light";
  }

  /**
   * Webview HTML：`<base>` 指向文档目录的 asWebviewUri。
   * Markdown 里的 `assets/x.png` 因此直接落到 localResourceRoots，无需扫 DOM / IPC 重写。
   */
  private getWebviewHtml(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
    documentUri: vscode.Uri,
  ): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, "dist", "webview", "main.js"),
    );
    const baseHref = escapeHtmlAttr(documentBaseHref(webview, documentUri));
    const appearance = this.resolveAppearance();
    const source = webview.cspSource;

    const csp = [
      "default-src 'none'",
      `img-src ${source} https: http: data: blob:`,
      `media-src ${source} https: http: blob:`,
      `frame-src ${source} https: http:`,
      `style-src ${source} 'unsafe-inline'`,
      `script-src ${source} 'unsafe-inline'`,
      `font-src ${source}`,
    ].join("; ");

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="${appearance === "dark" ? "dark" : "light"}" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <base href="${baseHref}" />
  <style>
    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      padding: 0;
    }
    #cherry-root { width: 100%; height: 100%; }
  </style>
</head>
<body>
  <div id="cherry-root"></div>
  <script src="${scriptUri}"></script>
</body>
</html>`;
  }
}
