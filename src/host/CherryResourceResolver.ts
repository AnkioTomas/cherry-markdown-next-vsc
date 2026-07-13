import * as path from "path";
import * as vscode from "vscode";

/**
 * 核心资源解析器
 * 负责将 Markdown 中千奇百怪的路径（相对、绝对、带参数）解析为 Webview 安全上下文内可访问的本地 URI。
 */
export class CherryResourceResolver {
  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly documentUri: vscode.Uri,
  ) {}

  /**
   * 获取 Webview 初始化时允许访问的基础目录白名单（Resource Roots）。
   * 包含：插件运行目录、当前文档所在目录、以及所有 Workspace 目录。
   */
  public getResourceRoots(): vscode.Uri[] {
    const roots = new Map<string, vscode.Uri>();
    
    // 1. 插件自身的静态资源目录（如 JS/CSS）
    roots.set(this.extensionUri.toString(), this.extensionUri);
    
    // 2. 当前正在编辑的 Markdown 文件所在的文件夹
    const docDir = vscode.Uri.joinPath(this.documentUri, "..");
    roots.set(docDir.toString(), docDir);

    // 3. 用户打开的所有工作区根目录
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      roots.set(folder.uri.toString(), folder.uri);
    }

    return [...roots.values()];
  }

  /**
   * 动态解析一组资源引用。
   * 如果引用超出了当前白名单范围，会将其上级目录推入 missingRoots，供 Webview 动态扩展沙盒权限。
   * 
   * @param webview 当前的 Webview 实例
   * @param refs 前端传来的原始路径数组（如 ["./img.png", "/assets/logo.png"]）
   * @param currentRoots 当前已生效的访问白名单
   */
  public resolve(
    webview: vscode.Webview,
    refs: string[],
    currentRoots: readonly vscode.Uri[],
  ): { resources: Record<string, string>; missingRoots: vscode.Uri[] } {
    const resources: Record<string, string> = {};
    const missingRoots: vscode.Uri[] = [];
    const seenMissing = new Set<string>();

    for (const ref of refs) {
      const target = this.resolveTargetUri(ref);
      if (!target) continue;

      // 越权检查：如果不在当前允许的根目录下，记录其父目录以便后续扩展权限
      if (!this.isUnderAnyRoot(target, currentRoots)) {
        // 使用 joinPath 向上追溯，严格保持原始 URI 的 Scheme (防 Remote 环境下丢失协议)
        const dir = vscode.Uri.joinPath(target, "..");
        if (!seenMissing.has(dir.toString())) {
          seenMissing.add(dir.toString());
          missingRoots.push(dir);
        }
      }

      try {
        // 将系统本地 URI 转换为 webview 可加载的 vscode-webview-resource:// 伪协议
        resources[ref] = webview.asWebviewUri(target).toString();
      } catch {
        // 忽略无法转换的 URL（通常是协议不支持）
      }
    }

    return { resources, missingRoots };
  }

  /**
   * 合并现有白名单与新增的白名单目录并去重。
   */
  public mergeRoots(
    current: readonly vscode.Uri[],
    extra: readonly vscode.Uri[],
  ): vscode.Uri[] {
    const map = new Map<string, vscode.Uri>();
    [...current, ...extra].forEach((r) => map.set(r.toString(), r));
    return [...map.values()];
  }

  /**
   * 将前端传来的脏路径字符串标准化为精准的系统级 vscode.Uri 对象。
   */
  private resolveTargetUri(ref: string): vscode.Uri | undefined {
    const trimmed = ref.trim();
    
    // 过滤空值与无需代理的外部网络资源 / DataURI
    if (!trimmed || /^(data:|blob:|https?:)/i.test(trimmed)) return undefined;
    
    // 已经是 file 协议则直接放行
    if (trimmed.startsWith("file:")) return vscode.Uri.parse(trimmed);

    // 净化路径：切除附带的 Query 参数或 Hash 锚点（如 ?v=1#hash），防止底层文件系统找不到真实文件
    let decoded = trimmed.split(/[?#]/)[0];
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      // 若解码失败则容错保持原样
    }

    // Markdown 的惯例：以 "/" 开头的绝对路径通常指代 Workspace 根目录
    if (decoded.startsWith("/")) {
      const ws = vscode.workspace.getWorkspaceFolder(this.documentUri);
      return ws
        ? vscode.Uri.joinPath(ws.uri, ...decoded.split("/").filter(Boolean))
        : vscode.Uri.file(decoded); // 若不在任何工作区内，退化为系统级别的绝对路径
    }

    // 处理常规相对路径（如 "./img.png" 或 "../assets/img.png"），基于当前 Markdown 文件所在目录推算
    const docDir = vscode.Uri.joinPath(this.documentUri, "..");
    return vscode.Uri.joinPath(docDir, ...decoded.split(/[/\\]+/).filter(Boolean));
  }

  /**
   * 判定目标文件是否在允许的根目录白名单范围内。
   */
  private isUnderAnyRoot(target: vscode.Uri, roots: readonly vscode.Uri[]): boolean {
    // 抹平 Windows 下的路径大小写差异
    const tPath = process.platform === "win32" ? target.fsPath.toLowerCase() : target.fsPath;
    
    return roots.some((root) => {
      // Scheme 必须完全一致（严防 file 去匹配 vscode-remote）
      if (target.scheme !== root.scheme) return false;
      
      const rPath = process.platform === "win32" ? root.fsPath.toLowerCase() : root.fsPath;
      
      // 目录名严格前缀匹配（必须补充系统分隔符 path.sep，防止类似 "/workspace10" 被错误匹配进 "/workspace1" 的大坑）
      return tPath === rPath || tPath.startsWith(rPath.endsWith(path.sep) ? rPath : `${rPath}${path.sep}`);
    });
  }
}
