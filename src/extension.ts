import * as vscode from "vscode";
import {CherryEditorProvider} from "./host/CherryEditorProvider";

export function activate(context: vscode.ExtensionContext) {
  const provider = new CherryEditorProvider(context);

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      CherryEditorProvider.viewType,
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
