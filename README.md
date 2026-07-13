# Cherry Markdown Next VSC

基于 [Cherry Markdown Next](https://github.com/AnkioTomas/cherry-markdown-next) 的 VS Code / Cursor 自定义 Markdown 编辑器。

打开 `*.md` 时默认使用 Cherry 编辑器：分栏预览、主题、图片上传、OpenAI 兼容 AI 工具栏。

## 功能

- **自定义编辑器**：`*.md` 默认以 Cherry 打开（分栏 / 仅编辑 / 仅预览）
- **主题**：`default` / `github` / `claude` / `morandi` / `latex` / `vue` / `notion`
- **跟随 VS Code 明暗色**
- **图片 / 文件上传**
  - `local`：保存到文档旁目录（默认 `assets/`），Markdown 写入相对路径
  - `script`：调用本地脚本（兼容 Typora Custom Command 约定）
  - `picgo` / `upic`：调用桌面端 CLI
- **AI 工具栏**（可选）：润色 / 校对 / 翻译 / 摘要 / 自定义  
  仅支持 OpenAI 兼容 Chat Completions（OpenAI、OpenRouter、DeepSeek、Moonshot、Ollama、自定义 endpoint）
- **配置热更新**：修改设置后自动重建编辑器

## 要求

- VS Code / Cursor `^1.125.0`
- 开发：Node.js + [pnpm](https://pnpm.io)

## 安装

### Marketplace

扩展发布后，在扩展市场搜索 **Cherry Markdown Next VSC**，或安装：

```text
ankio.cherry-markdown-next-vsc
```

### 本地 VSIX

```bash
pnpm install
pnpm run package
code --install-extension ./dist/cherry-markdown-next-vsc.vsix
# Cursor:
# cursor --install-extension ./dist/cherry-markdown-next-vsc.vsix
```

## 使用

1. 打开任意 `.md` 文件（默认使用本扩展）
2. 工具栏可打开设置；也可在设置中搜索 `Cherry Markdown Next`
3. 若要改回内置编辑器：编辑器标题栏右键 → **Reopen Editor With…** → 选择文本编辑器

## 配置

设置前缀：`cherryMarkdownNext.*`。改完后编辑器会自动重建。

### 界面

| 配置项 | 说明 | 默认 |
|--------|------|------|
| `ui.layout` | `split` / `edit` / `preview` | `split` |
| `ui.theme` | 主题 id | `default` |
| `ui.statusbar` | 底部状态栏 | `true` |
| `ui.sidebar` | 侧边栏 | `true` |
| `ui.lineNumbers` | 行号 | `true` |

### 上传

| 配置项 | 说明 | 默认 |
|--------|------|------|
| `upload.mode` | `off` / `local` / `script` / `picgo` / `upic` | `off` |
| `upload.directory` | `local` 模式相对文档目录的保存路径 | `assets` |
| `upload.script` | `script` 模式可执行脚本路径 | `""` |
| `upload.picgoPath` | PicGo 路径，空则自动探测 | `""` |
| `upload.upicPath` | uPic 路径，空则用默认安装位置 | `""` |
| `upload.timeoutMs` | CLI / 脚本超时（毫秒） | `60000` |

`script` 约定（对齐 Typora）：扩展只追加图片路径参数；成功时 stdout 首行为 `http(s)` URL。

### AI

| 配置项 | 说明 | 默认 |
|--------|------|------|
| `ai.enabled` | 启用 AI 工具栏 | `false` |
| `ai.provider` | 供应商预设 | `openai` |
| `ai.endpoint` | Chat Completions 完整 URL（可覆盖预设） | `""` |
| `ai.apiKey` | API Key（写入 settings.json） | `""` |
| `ai.apiKeyEnv` | 从环境变量读 Key（`apiKey` 为空时） | `""` |
| `ai.model` | 模型名，空则用供应商默认 | `""` |
| `ai.temperature` | `-1` 按动作默认；`0`–`2` 统一覆盖 | `-1` |
| `ai.headers` | 额外 HTTP 头 | `{}` |
| `ai.timeoutMs` | 请求超时 | `120000` |
| `ai.prompt.*` | 各动作 system 提示词，空则用内置 | `""` |

推荐用 `ai.apiKeyEnv`（如 `OPENAI_API_KEY`），避免 Key 进 `settings.json`。

示例：

```json
{
  "cherryMarkdownNext.upload.mode": "local",
  "cherryMarkdownNext.ai.enabled": true,
  "cherryMarkdownNext.ai.provider": "deepseek",
  "cherryMarkdownNext.ai.apiKeyEnv": "DEEPSEEK_API_KEY"
}
```

## 开发

```bash
pnpm install
pnpm run build
```

在 VS Code / Cursor 中打开本仓库，按 **F5**（`Run Extension`）启动 Extension Development Host。

常用脚本：

| 命令 | 作用 |
|------|------|
| `pnpm run build` | 构建 Host + Webview |
| `pnpm run watch` | 监听构建 Host |
| `pnpm run watch:webview` | 监听构建 Webview |
| `pnpm run typecheck` | TypeScript 检查 |
| `pnpm run package` | 打包到 `dist/cherry-markdown-next-vsc.vsix` |

### 结构

```text
src/
  extension.ts              # 激活入口
  host/                     # Extension Host（Node）
    CherryEditorProvider.ts # Custom Editor + IPC
    CherryUploader.ts       # 上传门面
    CherryAi.ts             # AI 请求
    uploader/               # local / script / picgo / upic
  webview/                  # Webview（浏览器沙箱）
    main.ts                 # Cherry 实例
    CherryBridge.ts         # postMessage 协议
dist/
  extension.js
  webview/main.js
  cherry-markdown-next-vsc.vsix
```

本地资源通过 Webview `<base href=asWebviewUri(文档目录)>` 解析相对路径（如 `assets/xxx.png`），无需事后扫 DOM。

## 发布到 Marketplace

1. 在 [Marketplace 管理页](https://marketplace.visualstudio.com/manage) 创建 publisher（ID = `ankio`）
2. 在 Azure DevOps 创建 PAT：Organization 选 **All accessible organizations**，Scope 勾选 **Marketplace → Manage**
3. 登录并发布：

```bash
./node_modules/.bin/vsce login ankio
./node_modules/.bin/vsce publish --no-dependencies
```

或上传已打好的 `dist/cherry-markdown-next-vsc.vsix`。

## 相关链接

- 本扩展仓库：[cherry-markdown-next-vsc](https://github.com/AnkioTomas/cherry-markdown-next-vsc)
- 编辑器内核：[cherry-markdown-next](https://github.com/AnkioTomas/cherry-markdown-next)
- 作者博客：https://ankio.net

## License

[MIT](./LICENSE) © 2026 Ankio
