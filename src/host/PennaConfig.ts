import * as vscode from "vscode";

export type UploadMode = "off" | "local" | "script" | "picgo" | "upic";

export type AiActionId =
  | "polish"
  | "proofread"
  | "translate"
  | "summarize"
  | "custom";

/** OpenAI 兼容 Chat Completions 供应商预设 */
export type AiProvider =
  | "openai"
  | "openrouter"
  | "deepseek"
  | "moonshot"
  | "ollama"
  | "custom";

export class PennaConfig {
  private cfg: vscode.WorkspaceConfiguration;

  constructor(resource?: vscode.Uri) {
    this.cfg = vscode.workspace.getConfiguration("pennaMarkdown", resource);
  }

  public setItem<T>(key: string, value: T) {
    this.cfg.set(key, value);
  }

  public getItem<T>(key: string, def: T): T {
    return this.cfg.get(key) ?? def;
  }
}
