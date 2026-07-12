import type { CherryConfig } from "./settings";

/** 各动作共用的硬约束：输出必须能直接替换进编辑器选区 */
const OUTPUT_RULES = `
输出规则（必须遵守）：
1. 只输出处理后的 Markdown 正文，不要开场白、不要总结、不要「如下所示」之类说明。
2. 不要用 \`\`\`markdown 包裹整个结果；原文里已有的代码块照常保留。
3. 保留原有 Markdown 结构：标题层级、列表、引用、表格、链接、图片、脚注、GFM/Cherry 扩展语法（Alert、容器、卡片等）能保留则保留。
4. 行内代码、代码块、公式、URL、锚点 id、frontmatter 键名不要擅自改写。
5. 若原文为空或无需改动，仍返回合理结果（摘要类可给出简短说明；其余尽量保持可替换文本）。
`.trim();

const ACTION_PROMPTS: Record<string, string> = {
  polish: `
你是资深中文技术写作者与 Markdown 编辑。任务：润色用户给出的 Markdown 片段。

目标：
- 表达更清晰、连贯、专业，去掉冗余与口语废话，但不改变原意与事实。
- 统一术语与人称；理顺长句；修正明显别扭的语序。
- 对英文专有名词、API、命令、路径保持原样。
- 不要扩写成长文，不要添加原文没有的观点或章节。

${OUTPUT_RULES}
`.trim(),

  proofread: `
你是严谨的中文校对编辑。任务：校对用户给出的 Markdown 片段。

只做纠错，不做风格重写：
- 错别字、多字漏字、同音误用（的/地/得 等）。
- 标点、中英文夹杂空格、全半角混用。
- 明显主谓残缺、搭配错误、重复字词。
- 专有名词大小写、常见技术名拼写（在有把握时修正）。
- 不要为了「更好看」改写句式；原意与结构尽量不动。

${OUTPUT_RULES}
`.trim(),

  translate: `
你是专业中英双语译者，熟悉技术文档与 Markdown。任务：翻译用户给出的 Markdown 片段。

方向判定：
- 若正文以中文为主 → 译为流畅、自然的英文。
- 若正文以英文为主 → 译为规范、通顺的简体中文。
- 中英混杂时：翻译叙述性文字，保留代码、标识符、命令、路径、URL、文件名不译。

要求：
- 术语前后一致；技术含义准确，避免机翻腔。
- 保持 Markdown 标记与结构位置对应（标题、列表、表格列等）。
- 链接文字可译，URL 本身不译；图片 alt 可译。

${OUTPUT_RULES}
`.trim(),

  summarize: `
你是信息提炼助手。任务：为用户给出的 Markdown 片段生成摘要。

要求：
- 使用简洁简体中文。
- 抓核心论点与关键信息，去掉例子堆砌与重复表述。
- 结构优先：3–8 条要点列表；若原文极短，可用 1–3 句概括。
- 不要引入原文没有的信息；不确定处不要臆造。
- 摘要本身使用合法 Markdown（可用列表/加粗），但不要复制原文全部内容。

${OUTPUT_RULES}
`.trim(),

  custom: `
你是可控的 Markdown 文本改写引擎。用户会给出「指令」与「文本」。
严格按指令处理文本；指令未要求的内容不要擅自发挥。

若指令与「保留 Markdown 结构」冲突，优先满足指令，但仍避免破坏代码块与 URL。
若指令含糊，做最小必要改动并保持可直接替换。

${OUTPUT_RULES}
`.trim(),
};

const ACTION_TEMPERATURE: Record<string, number> = {
  polish: 0.4,
  proofread: 0.1,
  translate: 0.2,
  summarize: 0.3,
  custom: 0.4,
};

function buildUserMessage(
  action: string,
  text: string,
  prompts?: string,
): string {
  if (action === "custom") {
    const instruction = prompts?.trim() || "优化表达，使更清晰，不改变原意。";
    return `## 指令\n${instruction}\n\n## 文本\n${text}`;
  }

  const labels: Record<string, string> = {
    polish: "请润色以下 Markdown：",
    proofread: "请校对以下 Markdown（只纠错，不重写风格）：",
    translate: "请翻译以下 Markdown：",
    summarize: "请总结以下 Markdown：",
  };
  const label = labels[action] || "请处理以下 Markdown：";
  return `${label}\n\n${text}`;
}

function stripModelFences(content: string): string {
  const trimmed = content.trim();
  const matched = trimmed.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i);
  return matched?.[1]?.trim() ?? trimmed;
}

export async function handleAiRequest(
  config: CherryConfig,
  action: string,
  text: string,
  prompts?: string,
): Promise<string> {
  if (!config.aiEnabled) {
    throw new Error("AI 未启用");
  }
  if (!config.aiEndpoint) {
    throw new Error("未配置 cherryMarkdownNext.ai.endpoint");
  }

  const system =
    ACTION_PROMPTS[action] ||
    `你是 Markdown 写作助手。按要求处理文本。\n\n${OUTPUT_RULES}`;
  const userContent = buildUserMessage(action, text, prompts);
  const temperature =
    config.aiTemperature >= 0
      ? config.aiTemperature
      : (ACTION_TEMPERATURE[action] ?? 0.3);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...config.aiHeaders,
  };
  if (config.aiApiKey && !headers.Authorization && !headers.authorization) {
    headers.Authorization = `Bearer ${config.aiApiKey}`;
  }

  const response = await fetch(config.aiEndpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: config.aiModel,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
      temperature,
    }),
    signal: AbortSignal.timeout(config.aiTimeoutMs),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `AI 请求失败 HTTP ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("AI 响应缺少内容");
  }
  return stripModelFences(content);
}
