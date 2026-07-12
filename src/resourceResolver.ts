import * as vscode from "vscode";

export function getResourceRoots(
  extensionUri: vscode.Uri,
  documentUri: vscode.Uri,
): vscode.Uri[] {
  const roots = new Map<string, vscode.Uri>();
  roots.set(extensionUri.toString(), extensionUri);

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(documentUri);
  if (workspaceFolder) {
    roots.set(workspaceFolder.uri.toString(), workspaceFolder.uri);
  }

  let current = vscode.Uri.joinPath(documentUri, "..");
  for (let i = 0; i < 8; i++) {
    roots.set(current.toString(), current);
    const parent = vscode.Uri.joinPath(current, "..");
    if (parent.fsPath === current.fsPath) {
      break;
    }
    current = parent;
  }

  return [...roots.values()];
}

function resolveDocumentResource(
  webview: vscode.Webview,
  documentUri: vscode.Uri,
  ref: string,
): string | undefined {
  const trimmed = ref.trim();
  if (!trimmed || /^(data:|blob:|https?:)/i.test(trimmed)) {
    return undefined;
  }

  let target: vscode.Uri;
  if (trimmed.startsWith("file:")) {
    target = vscode.Uri.parse(trimmed);
  } else if (trimmed.startsWith("/")) {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(documentUri);
    if (!workspaceFolder) {
      return undefined;
    }
    target = vscode.Uri.joinPath(workspaceFolder.uri, trimmed.slice(1));
  } else {
    target = vscode.Uri.joinPath(documentUri, "..", trimmed);
  }

  try {
    return webview.asWebviewUri(target).toString();
  } catch {
    return undefined;
  }
}

export function resolveDocumentResources(
  webview: vscode.Webview,
  documentUri: vscode.Uri,
  refs: string[],
): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const ref of refs) {
    const uri = resolveDocumentResource(webview, documentUri, ref);
    if (uri) {
      resolved[ref] = uri;
    }
  }
  return resolved;
}
