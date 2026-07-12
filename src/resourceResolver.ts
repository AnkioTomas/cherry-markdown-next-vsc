import * as path from "path";
import * as vscode from "vscode";

function isUnderRoot(target: vscode.Uri, root: vscode.Uri): boolean {
  if (target.scheme !== root.scheme) {
    return false;
  }
  const targetPath = target.fsPath;
  const rootPath = root.fsPath;
  if (process.platform === "win32") {
    const t = targetPath.toLowerCase();
    const r = rootPath.toLowerCase();
    return t === r || t.startsWith(r.endsWith("\\") ? r : `${r}\\`);
  }
  return (
    targetPath === rootPath ||
    targetPath.startsWith(rootPath.endsWith("/") ? rootPath : `${rootPath}/`)
  );
}

function isUnderAnyRoot(target: vscode.Uri, roots: readonly vscode.Uri[]): boolean {
  return roots.some((root) => isUnderRoot(target, root));
}

export function getResourceRoots(
  extensionUri: vscode.Uri,
  documentUri: vscode.Uri,
): vscode.Uri[] {
  const roots = new Map<string, vscode.Uri>();
  roots.set(extensionUri.toString(), extensionUri);

  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    roots.set(folder.uri.toString(), folder.uri);
  }

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(documentUri);
  if (workspaceFolder) {
    roots.set(workspaceFolder.uri.toString(), workspaceFolder.uri);
  }

  // 文档目录及其上层：覆盖相对路径 ../ 跳出当前目录的情况
  let current = vscode.Uri.joinPath(documentUri, "..");
  for (let i = 0; i < 16; i++) {
    roots.set(current.toString(), current);
    const parent = vscode.Uri.joinPath(current, "..");
    if (parent.fsPath === current.fsPath) {
      break;
    }
    current = parent;
  }

  return [...roots.values()];
}

function resolveTargetUri(
  documentUri: vscode.Uri,
  ref: string,
): vscode.Uri | undefined {
  const trimmed = ref.trim();
  if (!trimmed || /^(data:|blob:|https?:)/i.test(trimmed)) {
    return undefined;
  }

  if (trimmed.startsWith("file:")) {
    return vscode.Uri.parse(trimmed);
  }

  // Markdown 里以 / 开头：按工作区根相对路径处理（不是任意文件系统绝对路径）
  if (trimmed.startsWith("/")) {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(documentUri);
    if (!workspaceFolder) {
      return undefined;
    }
    const segments = trimmed.split("/").filter(Boolean);
    return vscode.Uri.joinPath(workspaceFolder.uri, ...segments);
  }

  const docDir = vscode.Uri.joinPath(documentUri, "..");
  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    // 保持原样
  }
  const segments = decoded.split(/[/\\]+/).filter((s) => s.length > 0);
  return vscode.Uri.joinPath(docDir, ...segments);
}

export function resolveDocumentResources(
  webview: vscode.Webview,
  documentUri: vscode.Uri,
  refs: string[],
  currentRoots: readonly vscode.Uri[],
): { resources: Record<string, string>; missingRoots: vscode.Uri[] } {
  const resources: Record<string, string> = {};
  const missingRoots: vscode.Uri[] = [];
  const seenMissing = new Set<string>();

  for (const ref of refs) {
    const target = resolveTargetUri(documentUri, ref);
    if (!target) {
      continue;
    }

    if (!isUnderAnyRoot(target, currentRoots)) {
      const dir = vscode.Uri.file(path.dirname(target.fsPath));
      if (!seenMissing.has(dir.toString())) {
        seenMissing.add(dir.toString());
        missingRoots.push(dir);
      }
    }

    try {
      resources[ref] = webview.asWebviewUri(target).toString();
    } catch {
      // 无法转换则跳过
    }
  }

  return { resources, missingRoots };
}

export function mergeResourceRoots(
  current: readonly vscode.Uri[],
  extra: readonly vscode.Uri[],
): vscode.Uri[] {
  const map = new Map<string, vscode.Uri>();
  for (const root of current) {
    map.set(root.toString(), root);
  }
  for (const root of extra) {
    map.set(root.toString(), root);
  }
  return [...map.values()];
}
