import * as path from "path";
import * as vscode from "vscode";
import type { CherryConfig } from "./settings";

export interface UploadRequest {
  name: string;
  mime: string;
  dataBase64: string;
}

export interface UploadResult {
  url: string;
  msg: string;
}

function uniqueFileName(name: string): string {
  const ext = path.extname(name);
  const base = path.basename(name, ext) || "file";
  const safe = base.replace(/[^\w.\-\u4e00-\u9fff]+/gi, "_");
  return `${safe}-${Date.now()}${ext}`;
}

function readJsonPath(data: unknown, fieldPath: string): unknown {
  const parts = fieldPath.split(".").filter(Boolean);
  let current: unknown = data;
  for (const part of parts) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

async function uploadToWorkspace(
  documentUri: vscode.Uri,
  request: UploadRequest,
  directory: string,
): Promise<UploadResult> {
  const fileName = uniqueFileName(request.name);
  const docDir = vscode.Uri.joinPath(documentUri, "..");
  const targetDir = directory
    ? vscode.Uri.joinPath(docDir, ...directory.split(/[/\\]+/).filter(Boolean))
    : docDir;
  const target = vscode.Uri.joinPath(targetDir, fileName);

  await vscode.workspace.fs.createDirectory(targetDir);
  await vscode.workspace.fs.writeFile(
    target,
    Buffer.from(request.dataBase64, "base64"),
  );

  const rel = directory
    ? `${directory.replace(/\\/g, "/")}/${fileName}`
    : fileName;
  return { url: rel, msg: request.name };
}

async function uploadToHttp(
  request: UploadRequest,
  config: CherryConfig,
): Promise<UploadResult> {
  if (!config.uploadUrl) {
    throw new Error("未配置 cherryMarkdownNext.upload.url");
  }

  const bytes = Buffer.from(request.dataBase64, "base64");
  const form = new FormData();
  form.append(
    config.uploadFormField,
    new Blob([new Uint8Array(bytes)], {
      type: request.mime || "application/octet-stream",
    }),
    request.name || "file",
  );

  const response = await fetch(config.uploadUrl, {
    method: "POST",
    headers: config.uploadHeaders,
    body: form,
    signal: AbortSignal.timeout(config.uploadTimeoutMs),
  });
  if (!response.ok) {
    throw new Error(`上传失败 HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = (await response.json()) as unknown;
    const resultUrl = readJsonPath(data, config.uploadUrlField);
    if (typeof resultUrl !== "string" || !resultUrl) {
      throw new Error(
        `上传响应缺少字段 ${config.uploadUrlField}（或类型不是字符串）`,
      );
    }
    const root =
      data && typeof data === "object" ? (data as Record<string, unknown>) : {};
    return {
      url: resultUrl,
      msg:
        (typeof root.msg === "string" && root.msg) ||
        (typeof root.message === "string" && root.message) ||
        request.name,
    };
  }

  const text = (await response.text()).trim();
  if (!text) {
    throw new Error("上传响应为空");
  }
  return { url: text, msg: request.name };
}

export async function handleUpload(
  documentUri: vscode.Uri,
  config: CherryConfig,
  request: UploadRequest,
): Promise<UploadResult> {
  switch (config.uploadMode) {
    case "workspace":
      return uploadToWorkspace(
        documentUri,
        request,
        config.uploadDirectory.trim(),
      );
    case "http":
      return uploadToHttp(request, config);
    default:
      throw new Error("文件上传已禁用");
  }
}
