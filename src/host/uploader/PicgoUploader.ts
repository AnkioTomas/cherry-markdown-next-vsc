import { existsSync } from "fs";
import * as os from "os";
import { BaseUploader, type UploadResult } from "./BaseUploader";

/**
 * PicGo 桌面端 2.1.0+ / picgo-core CLI：
 *   <PicGo> upload <file>
 *   picgo upload <file>
 *
 * 成功输出通常含 `[PicGo SUCCESS]:` 后跟 URL；也兼容 stdout 中任意 http(s) 行。
 */
export class PicgoUploader extends BaseUploader {
  async upload(tempPath: string, originalName: string): Promise<UploadResult> {
    const command = this.resolvePicgo();
    const { stdout, stderr } = await this.runCommand(command, [
      "upload",
      tempPath,
    ]);
    const url = this.parsePicgoOutput(stdout, stderr);
    return { url, msg: originalName };
  }

  private resolvePicgo(): string {
    const configured = this.resolveConfiguredPath(
      this.config.getItem<string>("upload.picgoPath", ""),
    );
    if (configured) {
      return configured;
    }

    for (const candidate of this.defaultCandidates()) {
      if (candidate.includes("/") || candidate.includes("\\")) {
        if (existsSync(candidate)) {
          return candidate;
        }
      } else {
        return candidate; // PATH 中的 picgo
      }
    }

    throw new Error(
      "未找到 PicGo，请安装桌面端或 picgo-core，或配置 cherryMarkdownNext.upload.picgoPath",
    );
  }

  private defaultCandidates(): string[] {
    switch (os.platform()) {
      case "darwin":
        return [
          "/Applications/PicGo.app/Contents/MacOS/PicGo",
          "picgo",
        ];
      case "win32":
        return ["picgo"];
      default:
        return ["picgo"];
    }
  }

  private parsePicgoOutput(stdout: string, stderr: string): string {
    const text = `${stdout}\n${stderr}`;
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const successIdx = lines.findIndex((line) =>
      /\[PicGo SUCCESS\]/i.test(line),
    );
    if (successIdx >= 0) {
      for (let i = successIdx + 1; i < lines.length; i++) {
        if (this.isUrl(lines[i])) {
          return lines[i];
        }
      }
    }

    for (let i = lines.length - 1; i >= 0; i--) {
      if (this.isUrl(lines[i])) {
        return lines[i];
      }
    }

    throw new Error(stderr.trim() || stdout.trim() || "PicGo 未返回 URL");
  }
}
