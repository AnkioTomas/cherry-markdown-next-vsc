const RESOURCE_ATTRS = ["src", "poster"] as const;
const RESOURCE_SELECTOR =
  "img[src], video[src], audio[src], iframe[src], source[src], video[poster]";

function needsExtensionResolve(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  if (/^(data:|blob:|https?:)/i.test(trimmed)) {
    return false;
  }
  if (trimmed.includes("vscode-cdn.net") || trimmed.includes("vscode-webview:")) {
    return false;
  }
  return true;
}

function getPreviewRoot(): HTMLElement | null {
  return document.querySelector("#cherry-root .cherry-preview");
}

function collectUnresolvedRefs(preview: ParentNode): string[] {
  const refs = new Set<string>();
  for (const element of preview.querySelectorAll(RESOURCE_SELECTOR)) {
    for (const attr of RESOURCE_ATTRS) {
      const value = element.getAttribute(attr);
      if (value && needsExtensionResolve(value)) {
        refs.add(value);
      }
    }
  }
  return [...refs];
}

function applyResolvedResources(
  preview: ParentNode,
  resources: Record<string, string>,
): void {
  for (const element of preview.querySelectorAll(RESOURCE_SELECTOR)) {
    for (const attr of RESOURCE_ATTRS) {
      const value = element.getAttribute(attr);
      if (!value) {
        continue;
      }
      const resolved = resources[value];
      if (resolved) {
        element.setAttribute(attr, resolved);
      }
    }
  }
}

let pendingResolve = false;

export function scheduleResourceRewrite(
  postMessage: (message: unknown) => void,
): void {
  const preview = getPreviewRoot();
  if (!preview || pendingResolve) {
    return;
  }

  const refs = collectUnresolvedRefs(preview);
  if (refs.length === 0) {
    return;
  }

  pendingResolve = true;
  postMessage({ type: "resolveResources", refs });
}

export function handleResolvedResources(resources: Record<string, string>): void {
  pendingResolve = false;
  const preview = getPreviewRoot();
  if (!preview || Object.keys(resources).length === 0) {
    return;
  }
  applyResolvedResources(preview, resources);
}

export function bindPreviewResourceRewrite(
  eventBus: { on(event: string, handler: () => void): () => void },
  postMessage: (message: unknown) => void,
): () => void {
  return eventBus.on("preview:rendered", () => {
    scheduleResourceRewrite(postMessage);
  });
}
