#!/usr/bin/env node
/**
 * MCP Server 包装层：把 code-i18n-agent CLI 暴露为标准 MCP 工具（stdio 传输）。
 *
 * 协议：MCP（Model Context Protocol）stdio transport —— newline-delimited JSON-RPC 2.0。
 * 零依赖实现，不引入 @modelcontextprotocol/sdk，直接在当前项目内可编译、可运行。
 *
 * 暴露的工具（对应 CLI 命令）：
 *   i18n_scan      扫描项目，统计硬编码字符串候选（只读，不写盘）
 *   i18n_run       全流程执行国际化（默认真实写盘，dry_run=true 时预览不改动）
 *   i18n_validate  校验 key/占位符/语法一致性（只读）
 *   i18n_report    生成 Markdown 报告（写 output/report.md）
 *
 * 用法（被 AI 客户端以 stdio MCP Server 方式拉起）：
 *   node dist/mcp-server.js        # 本地
 *   npx -y code-i18n-agent mcp     # 从 npm 一键拉起
 */
import * as readline from 'readline';
import * as cp from 'child_process';
import * as path from 'path';

// ---------------------------------------------------------------------------
// 常量与类型
// ---------------------------------------------------------------------------

const SERVER_NAME = 'code-i18n-mcp';
const SERVER_VERSION = '0.1.0';
const DEFAULT_PROTOCOL_VERSION = '2024-11-05';
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 全流程（含 LLM 翻译）默认最长 10 分钟

/** MCP 工具描述 */
interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** CLI 子进程执行结果 */
interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

// ---------------------------------------------------------------------------
// 工具定义（LLM 通过这里的 description 决定何时调用）
// ---------------------------------------------------------------------------

const TOOLS: McpTool[] = [
  {
    name: 'i18n_scan',
    description:
      '扫描指定项目源码中的硬编码字符串（仅统计候选，只读不写盘）。' +
      '用于在改动前评估项目国际化工作量。' +
      '输出：扫描文件数、候选数、keep/skip/review 分类统计。',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: '目标项目根目录的绝对路径，例如 D:/myapp（必填）'
        },
        config: {
          type: 'string',
          description: '配置文件路径（默认 <project>/i18n-agent.config.json）'
        }
      },
      required: ['project']
    }
  },
  {
    name: 'i18n_run',
    description:
      '对指定项目执行完整国际化流程：扫描→分类→提取key→翻译→替换源码→校验→报告。' +
      '默认会真实写盘（修改源码并生成 src/locales 资源），请先以 dry_run=true 预览改动，确认后再实际执行。' +
      '输出：统计摘要、替换示例、验证结果。',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: '目标项目根目录的绝对路径（必填）'
        },
        config: {
          type: 'string',
          description: '配置文件路径（默认 <project>/i18n-agent.config.json）'
        },
        dry_run: {
          type: 'boolean',
          description: 'true=只预览改动不写盘；false=真实执行（默认）'
        },
        locales: {
          type: 'string',
          description: '覆盖目标语言，逗号分隔，例如 "en-US,ja-JP"'
        },
        resume: {
          type: 'boolean',
          description: 'true=增量续跑，跳过未变化的已处理文件'
        },
        llm: {
          type: 'boolean',
          description: 'true=使用环境变量中的 LLM 做翻译（需 OPENAI_API_KEY 或 I18N_LLM_API_KEY）'
        },
        llm_model: {
          type: 'string',
          description: '指定 LLM 模型名，例如 gpt-4o-mini'
        }
      },
      required: ['project']
    }
  },
  {
    name: 'i18n_validate',
    description:
      '校验项目的 i18n 状态：key 一致性（目标语言=默认语言）、占位符保留、未翻译条目、替换后源码语法。' +
      '只读不写盘。用于检查国际化改造是否完整、有无遗漏或错误。',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: '目标项目根目录的绝对路径（必填）'
        },
        config: {
          type: 'string',
          description: '配置文件路径（默认 <project>/i18n-agent.config.json）'
        }
      },
      required: ['project']
    }
  },
  {
    name: 'i18n_report',
    description:
      '生成项目的国际化执行报告（Markdown，写入 <project>/output/report.md）。' +
      '内容含统计、替换 diff 示例、待审阅队列、问题清单。供人工复核。',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: '目标项目根目录的绝对路径（必填）'
        },
        config: {
          type: 'string',
          description: '配置文件路径（默认 <project>/i18n-agent.config.json）'
        }
      },
      required: ['project']
    }
  }
];

// ---------------------------------------------------------------------------
// stdio JSON-RPC 收发
// ---------------------------------------------------------------------------

function send(msg: unknown): void {
  // 每行一个 JSON，行尾必须有 \n（MCP stdio 帧分隔）
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function sendResult(id: unknown, content: string, isError: boolean): void {
  send({
    jsonrpc: '2.0',
    id,
    result: {
      content: [{ type: 'text', text: content }],
      isError
    }
  });
}

function sendError(id: unknown, code: number, message: string): void {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

// ---------------------------------------------------------------------------
// CLI 子进程执行（stdout/stderr 全部捕获，绝不污染协议流）
// ---------------------------------------------------------------------------

function runCli(args: string[], timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<CliResult> {
  return new Promise((resolve) => {
    const cliPath = path.join(__dirname, 'cli.js');
    const child = cp.spawn(process.execPath, [cliPath, ...args], {
      cwd: process.cwd(),
      env: process.env,
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (code: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    };
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
      finish(-1);
    }, timeoutMs);
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.on('error', (err) => {
      stderr += '\n[spawn error] ' + err.message;
      finish(-2);
    });
    child.on('close', (code) => finish(code ?? -1));
  });
}

/** 格式化工具调用结果文本 */
function formatResult(res: CliResult, timedOut: boolean): string {
  const parts: string[] = [];
  if (res.stdout.trim()) parts.push(res.stdout.trimEnd());
  if (res.stderr.trim()) parts.push('[stderr]\n' + res.stderr.trimEnd());
  parts.push(timedOut ? '[error] 执行超时（已终止）' : `[exit code] ${res.code}`);
  return parts.join('\n\n');
}

// ---------------------------------------------------------------------------
// tools/call 逻辑：参数 → CLI 参数
// ---------------------------------------------------------------------------

/** 把 MCP 参数值归一化为字符串（数组 join、布尔原样、其余 String） */
function toStr(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (Array.isArray(v)) return v.map(String).join(',');
  return String(v);
}

async function handleToolCall(name: string, params: Record<string, unknown> | undefined): Promise<{ content: string; isError: boolean }> {
  const p = params ?? {};
  const project = toStr(p.project) || process.cwd();
  const args: string[] = [];
  let timeoutMs = DEFAULT_TIMEOUT_MS;

  switch (name) {
    case 'i18n_scan':
      args.push('scan', '--project', project);
      if (p.config) args.push('--config', String(p.config));
      break;

    case 'i18n_run': {
      args.push('run', '--project', project);
      if (p.config) args.push('--config', String(p.config));
      if (p.locales) args.push('--locales', toStr(p.locales)!);
      if (p.dry_run) { args.push('--dry-run', '--yes'); }
      else { args.push('--yes'); } // 真实写盘：跳过交互确认（MCP 场景无法交互）
      if (p.resume) args.push('--resume');
      if (p.llm) args.push('--llm');
      if (p.llm_model) args.push('--llm-model', String(p.llm_model));
      break;
    }

    case 'i18n_validate':
      args.push('validate', '--project', project);
      if (p.config) args.push('--config', String(p.config));
      break;

    case 'i18n_report':
      args.push('report', '--project', project);
      if (p.config) args.push('--config', String(p.config));
      break;

    default:
      return { content: `未知工具: ${name}`, isError: true };
  }

  const res = await runCli(args, timeoutMs);
  const timedOut = res.code === -1;
  return { content: formatResult(res, timedOut), isError: res.code !== 0 };
}

// ---------------------------------------------------------------------------
// JSON-RPC 消息分派（串行队列，避免并发写文件冲突）
// ---------------------------------------------------------------------------

type RequestHandler = () => Promise<void>;

let queue: Promise<void> = Promise.resolve();

function enqueue(task: RequestHandler): void {
  queue = queue.then(task, task);
}

function handleMessage(line: string): void {
  const trimmed = line.trim();
  if (!trimmed) return;

  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    // 无法解析 → 无法取 id，只能发一个无 id 的错误（客户端通常忽略）
    send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    return;
  }

  const method = msg.method as string | undefined;
  const id = msg.id;
  const isRequest = id !== undefined && id !== null;

  // Notification（无 id）：无需响应
  if (!isRequest) {
    if (method === 'notifications/initialized') {
      // 客户端已就绪，无需处理
    }
    return;
  }

  switch (method) {
    case 'initialize': {
      const params = (msg.params ?? {}) as { protocolVersion?: string };
      const requested = params.protocolVersion || DEFAULT_PROTOCOL_VERSION;
      send({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: requested,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION }
        }
      });
      break;
    }

    case 'ping':
      send({ jsonrpc: '2.0', id, result: {} });
      break;

    case 'tools/list':
      send({
        jsonrpc: '2.0',
        id,
        result: { tools: TOOLS }
      });
      break;

    case 'tools/call': {
      const params = (msg.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
      const name = params.name;
      if (!name) {
        sendError(id, -32602, 'tools/call 缺少 name');
        break;
      }
      // 写盘类工具串行执行，避免并发冲突
      enqueue(async () => {
        const { content, isError } = await handleToolCall(name, params.arguments);
        sendResult(id, content, isError);
      });
      break;
    }

    case 'notifications/cancelled':
      // 已入队任务不做取消（保持简单），直接确认
      send({ jsonrpc: '2.0', id, result: {} });
      break;

    default:
      sendError(id, -32601, `Method not found: ${method}`);
  }
}

// ---------------------------------------------------------------------------
// 启动：逐行读取 stdin 并分派
// ---------------------------------------------------------------------------

/**
 * 启动 MCP Server（阻塞监听 stdin）。供本文件直接运行，或被 cli.ts 的 `mcp` 子命令复用。
 */
export function startMcpServer(): void {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on('line', handleMessage);
  rl.on('close', () => {
    // stdin 关闭：等待队列清空后退出
    queue.then(() => process.exit(0));
  });
  // 避免进程因残留句柄不退出的兜底
  process.on('SIGINT', () => process.exit(0));
}

if (require.main === module) {
  startMcpServer();
}
