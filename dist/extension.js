Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
//#endregion
let vscode = require("vscode");
vscode = __toESM(vscode);
//#region src/resourceResolver.ts
function getResourceRoots(extensionUri, documentUri) {
	const roots = /* @__PURE__ */ new Map();
	roots.set(extensionUri.toString(), extensionUri);
	const workspaceFolder = vscode.workspace.getWorkspaceFolder(documentUri);
	if (workspaceFolder) roots.set(workspaceFolder.uri.toString(), workspaceFolder.uri);
	let current = vscode.Uri.joinPath(documentUri, "..");
	for (let i = 0; i < 8; i++) {
		roots.set(current.toString(), current);
		const parent = vscode.Uri.joinPath(current, "..");
		if (parent.fsPath === current.fsPath) break;
		current = parent;
	}
	return [...roots.values()];
}
function resolveDocumentResource(webview, documentUri, ref) {
	const trimmed = ref.trim();
	if (!trimmed || /^(data:|blob:|https?:)/i.test(trimmed)) return;
	let target;
	if (trimmed.startsWith("file:")) target = vscode.Uri.parse(trimmed);
	else if (trimmed.startsWith("/")) {
		const workspaceFolder = vscode.workspace.getWorkspaceFolder(documentUri);
		if (!workspaceFolder) return;
		target = vscode.Uri.joinPath(workspaceFolder.uri, trimmed.slice(1));
	} else target = vscode.Uri.joinPath(documentUri, "..", trimmed);
	try {
		return webview.asWebviewUri(target).toString();
	} catch {
		return;
	}
}
function resolveDocumentResources(webview, documentUri, refs) {
	const resolved = {};
	for (const ref of refs) {
		const uri = resolveDocumentResource(webview, documentUri, ref);
		if (uri) resolved[ref] = uri;
	}
	return resolved;
}
//#endregion
//#region src/editorProvider.ts
function getNonce() {
	const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	let nonce = "";
	for (let i = 0; i < 32; i++) nonce += chars.charAt(Math.floor(Math.random() * 62));
	return nonce;
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
function resolveAppearance() {
	const kind = vscode.window.activeColorTheme.kind;
	return kind === vscode.ColorThemeKind.Dark || kind === vscode.ColorThemeKind.HighContrast ? "dark" : "light";
}
function getWebviewHtml(webview, extensionUri, documentText, appearance) {
	const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "dist", "webview", "main.js"));
	const nonce = getNonce();
	const boot = JSON.stringify({
		text: documentText,
		appearance
	});
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
  <script nonce="${nonce}">window.__CHERRY_BOOT__=${boot};<\/script>
  <script nonce="${nonce}" src="${scriptUri}"><\/script>
</body>
</html>`;
}
async function replaceDocumentText(document, text) {
	const edit = new vscode.WorkspaceEdit();
	const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
	edit.replace(document.uri, fullRange, text);
	return vscode.workspace.applyEdit(edit);
}
var CherryEditorProvider = class {
	static viewType = "cherry-markdown-next.editor";
	constructor(extensionUri) {
		this.extensionUri = extensionUri;
	}
	async resolveCustomTextEditor(document, webviewPanel, _token) {
		webviewPanel.webview.options = {
			enableScripts: true,
			localResourceRoots: getResourceRoots(this.extensionUri, document.uri)
		};
		webviewPanel.webview.html = getWebviewHtml(webviewPanel.webview, this.extensionUri, document.getText(), resolveAppearance());
		let suppressDocumentSync = false;
		const postInit = () => {
			webviewPanel.webview.postMessage({
				type: "init",
				text: document.getText(),
				appearance: resolveAppearance()
			});
		};
		const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument((event) => {
			if (event.document.uri.toString() !== document.uri.toString()) return;
			if (suppressDocumentSync) return;
			webviewPanel.webview.postMessage({
				type: "update",
				text: document.getText()
			});
		});
		const changeThemeSubscription = vscode.window.onDidChangeActiveColorTheme(() => {
			webviewPanel.webview.postMessage({
				type: "appearance",
				appearance: resolveAppearance()
			});
		});
		const messageSubscription = webviewPanel.webview.onDidReceiveMessage(async (message) => {
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
						resources: resolveDocumentResources(webviewPanel.webview, document.uri, message.refs)
					});
					break;
			}
		});
		webviewPanel.onDidDispose(() => {
			changeDocumentSubscription.dispose();
			changeThemeSubscription.dispose();
			messageSubscription.dispose();
		});
	}
};
//#endregion
//#region src/extension.ts
function activate(context) {
	const provider = new CherryEditorProvider(context.extensionUri);
	context.subscriptions.push(vscode.window.registerCustomEditorProvider(CherryEditorProvider.viewType, provider, {
		webviewOptions: { retainContextWhenHidden: true },
		supportsMultipleEditorsPerDocument: false
	}));
}
//#endregion
exports.activate = activate;

//# sourceMappingURL=extension.js.map