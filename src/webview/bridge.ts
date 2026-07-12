type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

const pending = new Map<number, Pending>();
let nextId = 1;

export function bridgeRequest<T>(
  postMessage: (message: unknown) => void,
  type: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, {
      resolve: (value) => resolve(value as T),
      reject,
    });
    postMessage({ type, id, ...payload });
  });
}

export function settleBridgeResult(
  message: {
    id?: number;
    ok?: boolean;
    error?: string;
    [key: string]: unknown;
  },
  mapResult: (message: Record<string, unknown>) => unknown,
): void {
  const id = message.id;
  if (typeof id !== "number") {
    return;
  }
  const entry = pending.get(id);
  if (!entry) {
    return;
  }
  pending.delete(id);
  if (message.ok) {
    entry.resolve(mapResult(message));
  } else {
    entry.reject(new Error(message.error || "请求失败"));
  }
}

export function createBridgedStorage(
  snapshot: Record<string, string>,
  postMessage: (message: unknown) => void,
): { getItem(key: string): string | null; setItem(key: string, value: string): void } {
  const cache = { ...snapshot };
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(cache, key)
        ? cache[key]
        : null;
    },
    setItem(key, value) {
      cache[key] = value;
      postMessage({ type: "storageSet", key, value });
    },
  };
}

export async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
