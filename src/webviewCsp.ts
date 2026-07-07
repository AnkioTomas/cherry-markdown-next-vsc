import type * as vscode from "vscode";

function buildContentSecurityPolicy(
  webview: vscode.Webview,
  nonce: string,
): string {
  const source = webview.cspSource;
  return [
    "default-src 'none'",
    `img-src ${source} https: http: data: blob:`,
    `media-src ${source} https: http: blob:`,
    `frame-src ${source} https: http:`,
    `style-src ${source} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
    `font-src ${source}`,
  ].join("; ");
}

export { buildContentSecurityPolicy };
