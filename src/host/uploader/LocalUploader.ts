import * as fs from "fs/promises";
import * as vscode from "vscode";
import { BaseUploader, type UploadResult } from "./BaseUploader";

/**
 * 把临时文件落到文档旁目录（默认 assets/），返回相对路径供 Markdown 引用。
 */
export class LocalUploader extends BaseUploader {
  async upload(tempPath: string, originalName: string): Promise<UploadResult> {
    const directory = this.config
      .getItem<string>("upload.directory", "assets")
      .trim()
      .replace(/\\/g, "/");
    const fileName = this.uniqueFileName(originalName);
    const docDir = vscode.Uri.joinPath(this.documentUri, "..");
    const segments = directory.split("/").filter(Boolean);
    const targetDir = segments.length
      ? vscode.Uri.joinPath(docDir, ...segments)
      : docDir;
    const target = vscode.Uri.joinPath(targetDir, fileName);

    const bytes = await fs.readFile(tempPath);
    await vscode.workspace.fs.createDirectory(targetDir);
    await vscode.workspace.fs.writeFile(target, bytes);

    const url = segments.length ? `${segments.join("/")}/${fileName}` : fileName;
    return { url, msg: originalName };
  }
}
