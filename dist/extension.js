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
function getWebviewHtml(webview, extensionUri) {
  const scriptUri = webview.asWebviewUri(
    vscode__namespace.Uri.joinPath(extensionUri, "dist", "webview", "main.js")
  );
  const nonce = getNonce();
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data: blob:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};" />
</head>
<body>
  <div id="cherry-root"></div>
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
      localResourceRoots: [this.extensionUri]
    };
    webviewPanel.webview.html = getWebviewHtml(
      webviewPanel.webview,
      this.extensionUri
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
