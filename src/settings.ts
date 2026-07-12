import * as vscode from "vscode";

export type UploadMode = "off" | "workspace" | "http";

export interface CherryConfig {
  uploadMode: UploadMode;
  uploadDirectory: string;
  uploadUrl: string;
  uploadFormField: string;
  uploadUrlField: string;
  uploadHeaders: Record<string, string>;
  uploadTimeoutMs: number;
  aiEnabled: boolean;
  aiEndpoint: string;
  aiApiKey: string;
  aiModel: string;
  aiTemperature: number;
  aiHeaders: Record<string, string>;
  aiTimeoutMs: number;
}

function asStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") {
      out[key] = item;
    }
  }
  return out;
}

function resolveApiKey(cfg: vscode.WorkspaceConfiguration): string {
  const direct = cfg.get<string>("ai.apiKey", "").trim();
  if (direct) {
    return direct;
  }
  const envName = cfg.get<string>("ai.apiKeyEnv", "").trim();
  if (!envName) {
    return "";
  }
  return process.env[envName]?.trim() || "";
}

function clampTimeout(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 1000) {
    return fallback;
  }
  return Math.floor(n);
}

export function readCherryConfig(
  resource?: vscode.Uri,
): CherryConfig {
  const cfg = vscode.workspace.getConfiguration("cherryMarkdownNext", resource);
  const uploadMode = cfg.get<string>("upload.mode", "workspace");
  const temperature = cfg.get<number>("ai.temperature", -1);
  return {
    uploadMode:
      uploadMode === "off" || uploadMode === "http" || uploadMode === "workspace"
        ? uploadMode
        : "workspace",
    uploadDirectory: cfg.get<string>("upload.directory", "assets"),
    uploadUrl: cfg.get<string>("upload.url", "").trim(),
    uploadFormField:
      cfg.get<string>("upload.formField", "file").trim() || "file",
    uploadUrlField: cfg.get<string>("upload.urlField", "url").trim() || "url",
    uploadHeaders: asStringRecord(cfg.get("upload.headers")),
    uploadTimeoutMs: clampTimeout(cfg.get("upload.timeoutMs"), 60_000),
    aiEnabled: cfg.get<boolean>("ai.enabled", false),
    aiEndpoint: cfg.get<string>("ai.endpoint", "").trim(),
    aiApiKey: resolveApiKey(cfg),
    aiModel: cfg.get<string>("ai.model", "gpt-4o-mini").trim() || "gpt-4o-mini",
    aiTemperature:
      typeof temperature === "number" && Number.isFinite(temperature)
        ? temperature
        : -1,
    aiHeaders: asStringRecord(cfg.get("ai.headers")),
    aiTimeoutMs: clampTimeout(cfg.get("ai.timeoutMs"), 120_000),
  };
}

/** 传给 webview 的精简配置（不含密钥） */
export function toWebviewConfig(config: CherryConfig) {
  return {
    uploadEnabled: config.uploadMode !== "off",
    aiEnabled: config.aiEnabled && Boolean(config.aiEndpoint),
  };
}
