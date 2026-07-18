import { execFile } from "child_process";
import { promisify } from "util";
import * as path from "path";
import * as vscode from "vscode";
import type { PennaConfig } from "../PennaConfig";

const execFileAsync = promisify(execFile);

export interface UploadResult {
  url: string;
  msg: string;
}

/**
 * 上传器：Host 已把文件落到 tempPath，子类只负责“把这个路径变成 URL”。
 */
export abstract class BaseUploader {
  constructor(
    protected readonly documentUri: vscode.Uri,
    protected readonly config: PennaConfig,
  ) {}

  abstract upload(tempPath: string, originalName: string): Promise<UploadResult>;

  protected get timeoutMs(): number {
    return Math.max(1000, this.config.getItem<number>("upload.timeoutMs", 60_000));
  }

  protected get documentDir(): string {
    return path.dirname(this.documentUri.fsPath);
  }

  protected resolveConfiguredPath(configured: string): string {
    const trimmed = configured.trim();
    if (!trimmed) {
      return "";
    }
    if (path.isAbsolute(trimmed)) {
      return trimmed;
    }
    const folder = vscode.workspace.getWorkspaceFolder(this.documentUri);
    const base = folder?.uri.fsPath ?? this.documentDir;
    return path.resolve(base, trimmed);
  }

  protected async runCommand(
    command: string,
    args: string[],
  ): Promise<{ stdout: string; stderr: string }> {
    try {
      const { stdout, stderr } = await execFileAsync(command, args, {
        cwd: this.documentDir,
        timeout: this.timeoutMs,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      });
      return { stdout: String(stdout), stderr: String(stderr) };
    } catch (error) {
      if (error && typeof error === "object") {
        const stdout = String(
          (error as { stdout?: Buffer | string }).stdout ?? "",
        );
        const stderr = String(
          (error as { stderr?: Buffer | string }).stderr ?? "",
        );
        if (stdout.trim() || stderr.trim()) {
          return { stdout, stderr };
        }
      }
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  protected isUrl(text: string): boolean {
    return /^https?:\/\//i.test(text);
  }

  protected uniqueFileName(name: string): string {
    const ext = path.extname(name);
    const base = path.basename(name, ext) || "file";
    const safe = base.replace(/[^\w.\-\u4e00-\u9fff]+/gi, "_");
    return `${safe}-${Date.now()}${ext}`;
  }
}
