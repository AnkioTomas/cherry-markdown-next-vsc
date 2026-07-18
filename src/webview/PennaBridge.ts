/** 等待 Host 回包的 Promise 回调 */
type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  onStream?: (data: unknown) => void;
};

/**
 * Webview ↔ Extension Host 的 IPC 消息结构。
 * - command: 指令名
 * - reqId: 请求 ID；有值表示这是一次可回包的请求/响应
 * - data: 载荷
 * - error: ask 失败时由 Host 回写
 */
export type ExtMessage = {
  command: string;
  reqId?: string;
  data?: unknown;
  error?: string;
  /** 为 true 表示流式中间推送，reqId 不结算 */
  streaming?: boolean;
};

/** 只要能 postMessage 即可，避免 webview 侧依赖 vscode 模块 */
type Postable = {
  postMessage(message: unknown): void;
};

type MessageHandler = (data: unknown) => void;

/**
 * Webview 侧消息桥。
 * 封装 acquireVsCodeApi，提供单向发送、带返回值的异步请求，以及 Host 推送事件订阅。
 */
export class PennaBridge {
  private readonly vscode = acquireVsCodeApi();
  /** reqId → 等待中的 Promise 回调 */
  private readonly pending = new Map<string, Pending>();
  /** command → Host 推送事件回调（无 reqId） */
  private readonly handlers = new Map<string, Set<MessageHandler>>();

  constructor() {
    // 监听来自插件宿主的消息
    window.addEventListener("message", (event) => {
      this.onHostMessage(event.data as ExtMessage);
    });
  }

  /**
   * 订阅 Host → Webview 的推送事件（无 reqId，例如 update / appearance）。
   *
   * @param command 指令名
   * @param handler 回调，参数为 message.data
   */
  on(command: string, handler: MessageHandler): void {
    let set = this.handlers.get(command);
    if (!set) {
      set = new Set();
      this.handlers.set(command, set);
    }
    set.add(handler);
  }

  /**
   * 单向发送消息给 Extension Host（不等待回包）。
   *
   * @param command 指令名
   * @param data 可选载荷
   */
  post(command: string, data?: unknown): void {
    this.vscode.postMessage({ command, data } satisfies ExtMessage);
  }

  /**
   * 带返回值的异步调用：生成 reqId，挂起 Promise，等 Host 用同一 reqId 回包后 resolve。
   *
   * @param command 指令名
   * @param data 可选载荷
   * @returns Host 回写的 data
   */
  ask<T = unknown>(command: string, data?: unknown): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const reqId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      this.pending.set(reqId, {
        resolve: (value) => resolve(value as T),
        reject,
      });
      this.vscode.postMessage({ command, reqId, data } satisfies ExtMessage);
    });
  }

  /**
   * 带流式中间推送的异步请求：Host 可在最终 resolve 前多次推送 streaming 数据。
   *
   * @param command 指令名
   * @param data 请求载荷
   * @param onStream 每次收到 streaming 推送时调用
   * @returns 最终结果
   */
  askStream<T = unknown>(
    command: string,
    data: unknown,
    onStream: (chunk: unknown) => void,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const reqId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      this.pending.set(reqId, {
        resolve: (value) => resolve(value as T),
        reject,
        onStream,
      });
      this.vscode.postMessage({ command, reqId, data } satisfies ExtMessage);
    });
  }

  private onHostMessage(message: ExtMessage): void {
    if (!message?.command) {
      return;
    }

    // 带 reqId 且在 pending 中
    if (message.reqId && this.pending.has(message.reqId)) {
      const entry = this.pending.get(message.reqId)!;
      // 流式中间推送：不结算，交给 onStream 处理
      if (message.streaming) {
        entry.onStream?.(message.data);
        return;
      }
      // 最终结算
      this.pending.delete(message.reqId);
      if (message.error) {
        entry.reject(new Error(message.error));
      } else {
        entry.resolve(message.data);
      }
      return;
    }

    // 无 reqId：推送事件
    const set = this.handlers.get(message.command);
    if (!set) {
      return;
    }
    for (const handler of set) {
      handler(message.data);
    }
  }
}

/**
 * Extension Host 侧回写成功响应：保留原 message 的 command/reqId，只替换 data 后发回 Webview。
 *
 * @param message 原始请求消息（含 reqId）
 * @param data 要返回给 Webview 的数据
 * @param webview 目标 Webview（或任意可 postMessage 的对象）
 */
export function extResponse(
  message: ExtMessage,
  data: unknown,
  webview: Postable,
): void {
  webview.postMessage({
    command: message.command,
    reqId: message.reqId,
    data,
  } satisfies ExtMessage);
}

/**
 * Extension Host 侧回写失败响应，触发 Webview 侧 ask 的 reject。
 *
 * @param message 原始请求消息（含 reqId）
 * @param error 错误对象或字符串
 * @param webview 目标 Webview
 */
export function extError(
  message: ExtMessage,
  error: unknown,
  webview: Postable,
): void {
  webview.postMessage({
    command: message.command,
    reqId: message.reqId,
    error: error instanceof Error ? error.message : String(error),
  } satisfies ExtMessage);
}
