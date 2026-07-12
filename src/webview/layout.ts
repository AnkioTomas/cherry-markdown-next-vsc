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
