const SPLIT_STORAGE_KEY = "cherry-editor-split";

export function resetSplitRatio(): void {
  try {
    localStorage.setItem(SPLIT_STORAGE_KEY, "0.5");
  } catch {
    // webview 隐私模式等场景下忽略
  }
}

export function bindLayoutRefresh(
  root: HTMLElement,
  refresh: () => void,
): () => void {
  let frame = 0;

  const schedule = () => {
    if (frame) {
      cancelAnimationFrame(frame);
    }
    frame = requestAnimationFrame(() => {
      frame = 0;
      refresh();
    });
  };

  const observer = new ResizeObserver(schedule);
  observer.observe(root);

  window.addEventListener("resize", schedule, { passive: true });
  schedule();

  return () => {
    observer.disconnect();
    window.removeEventListener("resize", schedule);
    if (frame) {
      cancelAnimationFrame(frame);
    }
  };
}
