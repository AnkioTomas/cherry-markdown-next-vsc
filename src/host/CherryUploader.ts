import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import type * as vscode from "vscode";
import type { CherryConfig, UploadMode } from "./CherryConfig";
import type { BaseUploader, UploadResult } from "./uploader/BaseUploader";
import { LocalUploader } from "./uploader/LocalUploader";
import { PicgoUploader } from "./uploader/PicgoUploader";
import { ScriptUploader } from "./uploader/ScriptUploader";
import { UPicUploader } from "./uploader/UPicUploader";

export type { UploadResult } from "./uploader/BaseUploader";

export interface UploadRequest {
  name: string;
  mime: string;
  dataBase64: string;
}

/**
 * 上传门面：base64 → 临时文件 → 按 mode 交给具体 Uploader → 清理临时目录。
 */
export class CherryUploader {
  constructor(
    private readonly documentUri: vscode.Uri,
    private readonly config: CherryConfig,
  ) {}

  public async upload(request: UploadRequest): Promise<UploadResult> {
    const mode = this.config.getItem<UploadMode>("upload.mode", "off");
    if (mode === "off") {
      throw new Error("文件上传已禁用");
    }

    const uploader = this.createUploader(mode);
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cherry-upload-"));
    const fileName = this.uniqueFileName(request.name);
    const tmpFile = path.join(tmpDir, fileName);

    try {
      await fs.writeFile(tmpFile, Buffer.from(request.dataBase64, "base64"));
      return await uploader.upload(tmpFile, request.name || fileName);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private createUploader(mode: Exclude<UploadMode, "off">): BaseUploader {
    switch (mode) {
      case "local":
        return new LocalUploader(this.documentUri, this.config);
      case "script":
        return new ScriptUploader(this.documentUri, this.config);
      case "picgo":
        return new PicgoUploader(this.documentUri, this.config);
      case "upic":
        return new UPicUploader(this.documentUri, this.config);
      default: {
        const _exhaustive: never = mode;
        throw new Error(`未知上传模式: ${String(_exhaustive)}`);
      }
    }
  }

  private uniqueFileName(name: string): string {
    const ext = path.extname(name);
    const base = path.basename(name, ext) || "file";
    const safe = base.replace(/[^\w.\-\u4e00-\u9fff]+/gi, "_");
    return `${safe}-${Date.now()}${ext}`;
  }
}
