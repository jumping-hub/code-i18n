/**
 * OpenAI 兼容 Chat Completions 客户端（Node 18+ 内置 fetch，无第三方依赖）。
 */
import { LlmConfig } from '../types';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  /** 期望 JSON 输出（追加指令并在解析失败时重试一次） */
  json?: boolean;
}

export class LlmClient {
  constructor(private cfg: LlmConfig) {}

  async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
    if (this.cfg.provider === 'mock') {
      // 本地模拟：从 user 消息解析 "id": "src" 对，返回 {id: '[mock] ' + src}
      let userMsg = '';
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'user') { userMsg = messages[i].content; break; }
      }
      const pairs: Record<string, string> = {};
      const re = /("([^"]+)"):\s*("(?:\\.|[^"\\])*")/g;
      let mm: RegExpExecArray | null;
      while ((mm = re.exec(userMsg))) {
        pairs[mm[2]] = '[mock] ' + mm[3].slice(1, -1);
      }
      if (Object.keys(pairs).length > 0) return JSON.stringify(pairs);
      return opts.json ? '{}' : messages.map((m) => m.content).join('\n');
    }
    const base = (this.cfg.baseURL || 'https://api.openai.com/v1').replace(/\/$/, '');
    const url = base + '/chat/completions';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs || 60000);
    try {
      const body: Record<string, unknown> = {
        model: this.cfg.model,
        messages,
        temperature: opts.temperature ?? this.cfg.temperature ?? 0.2,
      };
      if (opts.maxTokens) body.max_tokens = opts.maxTokens;
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + (this.cfg.apiKey || ''),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!resp.ok) {
        const errText = (await resp.text()).slice(0, 500);
        throw new Error('LLM 请求失败 HTTP ' + resp.status + ': ' + errText);
      }
      const data = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content ?? '';
      return content;
    } finally {
      clearTimeout(timer);
    }
  }

  /** 请求 JSON 输出，失败重试一次 */
  async chatJson<T>(messages: ChatMessage[], opts: ChatOptions = {}): Promise<T> {
    const msgs: ChatMessage[] = [
      ...messages,
      { role: 'system', content: '你必须只输出合法的 JSON，不要输出任何解释或 markdown 代码块标记。' },
    ];
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await this.chat(msgs, { ...opts, json: true });
      try {
        return JSON.parse(extractJson(raw)) as T;
      } catch (e) {
        if (attempt === 1) throw new Error('LLM JSON 解析失败: ' + String(e) + ' 原始输出: ' + raw.slice(0, 300));
      }
    }
    throw new Error('unreachable');
  }
}

/** 从 LLM 输出中提取 JSON（容忍代码块包裹） */
function extractJson(raw: string): string {
  const trimmed = raw.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed);
  if (fence) return fence[1].trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

/** 创建 mock 配置（本地测试用） */
export function mockLlmConfig(): LlmConfig {
  return { provider: 'mock', model: 'mock-model' };
}