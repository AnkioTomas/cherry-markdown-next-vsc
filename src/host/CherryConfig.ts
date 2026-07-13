import * as vscode from "vscode";

export type UploadMode = "off" | "workspace" | "http";

export type AiActionId =
  | "polish"
  | "proofread"
  | "translate"
  | "summarize"
  | "custom";



export class CherryConfig {

  private cfg: vscode.WorkspaceConfiguration

  constructor(resource?: vscode.Uri) {
    this.cfg = vscode.workspace.getConfiguration("cherryMarkdownNext", resource);
  }

  public setItem<T>(key: string, value: T) {
    this.cfg.set(key, value);
  }

  public getItem<T>(key:string, def: T):T{
    return this.cfg.get(key) ?? def;
  }

}
