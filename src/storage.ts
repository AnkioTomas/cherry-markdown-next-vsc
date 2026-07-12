import type * as vscode from "vscode";

const STATE_KEY = "cherry.storage";

export function readStorageSnapshot(
  context: vscode.ExtensionContext,
): Record<string, string> {
  const raw = context.globalState.get<Record<string, string>>(STATE_KEY, {});
  if (!raw || typeof raw !== "object") {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") {
      out[key] = value;
    }
  }
  return out;
}

export async function writeStorageItem(
  context: vscode.ExtensionContext,
  key: string,
  value: string,
): Promise<void> {
  const next = { ...readStorageSnapshot(context), [key]: value };
  await context.globalState.update(STATE_KEY, next);
}
