import * as vscode from "vscode";
import {PennaEditorProvider} from "./host/PennaEditorProvider";

export function activate(context: vscode.ExtensionContext) {
  const provider = new PennaEditorProvider(context);

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      PennaEditorProvider.viewType,
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
        supportsMultipleEditorsPerDocument: false,
      },
    ),
  );
}
