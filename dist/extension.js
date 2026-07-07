"use strict";
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const vscode = require("vscode");
function _interopNamespaceDefault(e) {
  const n = Object.create(null, { [Symbol.toStringTag]: { value: "Module" } });
  if (e) {
    for (const k in e) {
      if (k !== "default") {
        const d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: () => e[k]
        });
      }
    }
  }
  n.default = e;
  return Object.freeze(n);
}
const vscode__namespace = /* @__PURE__ */ _interopNamespaceDefault(vscode);
function getResourceRoots(extensionUri, documentUri) {
  const roots = /* @__PURE__ */ new Map();
  roots.set(extensionUri.toString(), extensionUri);
  const workspaceFolder = vscode__namespace.workspace.getWorkspaceFolder(documentUri);
  if (workspaceFolder) {
    roots.set(workspaceFolder.uri.toString(), workspaceFolder.uri);
  }
  let current = vscode__namespace.Uri.joinPath(documentUri, "..");
  for (let i = 0; i < 8; i++) {
    roots.set(current.toString(), current);
    const parent = vscode__namespace.Uri.joinPath(current, "..");
    if (parent.fsPath === current.fsPath) {
      break;
    }
    current = parent;
  }
  return [...roots.values()];
}
function resolveDocumentResource(webview, documentUri, ref) {
  const trimmed = ref.trim();
  if (!trimmed || /^(data:|blob:|https?:)/i.test(trimmed)) {
    return void 0;
  }
  let target;
  if (trimmed.startsWith("file:")) {
    target = vscode__namespace.Uri.parse(trimmed);
  } else if (trimmed.startsWith("/")) {
    const workspaceFolder = vscode__namespace.workspace.getWorkspaceFolder(documentUri);
    if (!workspaceFolder) {
      return void 0;
    }
    target = vscode__namespace.Uri.joinPath(workspaceFolder.uri, trimmed.slice(1));
  } else {
    target = vscode__namespace.Uri.joinPath(documentUri, "..", trimmed);
  }
  try {
    return webview.asWebviewUri(target).toString();
  } catch {
    return void 0;
  }
}
function resolveDocumentResources(webview, documentUri, refs) {
  const resolved = {};
  for (const ref of refs) {
    const uri = resolveDocumentResource(webview, documentUri, ref);
    if (uri) {
      resolved[ref] = uri;
    }
  }
  return resolved;
}
function buildContentSecurityPolicy(webview, nonce) {
  const source = webview.cspSource;
  return [
    "default-src 'none'",
    `img-src ${source} https: http: data: blob:`,
    `media-src ${source} https: http: blob:`,
    `frame-src ${source} https: http:`,
    `style-src ${source} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
    `font-src ${source}`
  ].join("; ");
}
function getNonce() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
function resolveAppearance() {
  const kind = vscode__namespace.window.activeColorTheme.kind;
  return kind === vscode__namespace.ColorThemeKind.Dark || kind === vscode__namespace.ColorThemeKind.HighContrast ? "dark" : "light";
}
function getWebviewHtml(webview, extensionUri, documentText, appearance) {
  const scriptUri = webview.asWebviewUri(
    vscode__namespace.Uri.joinPath(extensionUri, "dist", "webview", "main.js")
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
  <script nonce="${nonce}">window.__CHERRY_BOOT__=${boot};<\/script>
  <script nonce="${nonce}" src="${scriptUri}"><\/script>
</body>
</html>`;
}
async function replaceDocumentText(document, text) {
  const edit = new vscode__namespace.WorkspaceEdit();
  const fullRange = new vscode__namespace.Range(
    document.positionAt(0),
    document.positionAt(document.getText().length)
  );
  edit.replace(document.uri, fullRange, text);
  return vscode__namespace.workspace.applyEdit(edit);
}
class CherryEditorProvider {
  constructor(extensionUri) {
    this.extensionUri = extensionUri;
  }
  async resolveCustomTextEditor(document, webviewPanel, _token) {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: getResourceRoots(this.extensionUri, document.uri)
    };
    webviewPanel.webview.html = getWebviewHtml(
      webviewPanel.webview,
      this.extensionUri,
      document.getText(),
      resolveAppearance()
    );
    let suppressDocumentSync = false;
    const postInit = () => {
      webviewPanel.webview.postMessage({
        type: "init",
        text: document.getText(),
        appearance: resolveAppearance()
      });
    };
    const changeDocumentSubscription = vscode__namespace.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() !== document.uri.toString()) {
        return;
      }
      if (suppressDocumentSync) {
        return;
      }
      webviewPanel.webview.postMessage({
        type: "update",
        text: document.getText()
      });
    });
    const changeThemeSubscription = vscode__namespace.window.onDidChangeActiveColorTheme(() => {
      webviewPanel.webview.postMessage({
        type: "appearance",
        appearance: resolveAppearance()
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
            await replaceDocumentText(document, message.text);
            suppressDocumentSync = false;
            break;
          case "resolveResources":
            webviewPanel.webview.postMessage({
              type: "resolvedResources",
              resources: resolveDocumentResources(
                webviewPanel.webview,
                document.uri,
                message.refs
              )
            });
            break;
        }
      }
    );
    webviewPanel.onDidDispose(() => {
      changeDocumentSubscription.dispose();
      changeThemeSubscription.dispose();
      messageSubscription.dispose();
    });
  }
}
__publicField(CherryEditorProvider, "viewType", "cherry-markdown-next.editor");
function activate(context) {
  const provider = new CherryEditorProvider(context.extensionUri);
  context.subscriptions.push(
    vscode__namespace.window.registerCustomEditorProvider(
      CherryEditorProvider.viewType,
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true
        },
        supportsMultipleEditorsPerDocument: false
      }
    )
  );
}
function deactivate() {
}
exports.activate = activate;
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map
