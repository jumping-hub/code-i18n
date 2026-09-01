import * as fs from 'fs';
import * as path from 'path';
import { I18nAgentConfig, LlmConfig } from './types';

/** 默认配置 */
export function defaultConfig(project: string): I18nAgentConfig {
  return {
    project: path.resolve(project),
    src: ["src"],
    ignore: [
      "**/node_modules/**", "**/dist/**", "**/build/**", "**/.git/**",
      "**/*.min.js", "**/*.d.ts", "**/locales/**", "**/.i18n-agent/**"
    ],
    extensions: [".ts", ".tsx", ".js", ".jsx", ".vue", ".html"],
    locales: {
      dir: "src/locales",
      default: "zh-CN",
      targets: ["en-US"]
    },
    keyStyle: "semantic",
    translationFn: "t",
    importStatement: "import { useI18n } from 'vue-i18n';",
    autoImport: true,
    backup: true,
    dryRun: false,
    callStyle: "call",
    llm: undefined,
    glossary: [],
    llmClassify: false,
    placeholderSyntax: ["{}", "{{}}", "%s", "${}"],
    skipPatterns: [],
    keepPatterns: [],
    logLevel: "info"
  };
}

/**
 * 加载配置：<project>/i18n-agent.config.json（可选）与默认配置深合并，支持 JSONC
 */
export function loadConfig(project: string, overrides?: Partial<I18nAgentConfig> & Record<string, unknown>): I18nAgentConfig {
  const base = defaultConfig(project);
  const configPath = path.join(base.project, 'i18n-agent.config.json');
  let fileCfg: Record<string, unknown> = {};
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, 'utf8');
    fileCfg = parseJsonc(raw);
  }
  const merged = deepMerge(base as unknown as Record<string, unknown>, fileCfg) as unknown as I18nAgentConfig;
  if (overrides) {
    const m = deepMerge(merged as unknown as Record<string, unknown>, overrides as unknown as Record<string, unknown>);
    Object.assign(merged, m);
  }
  merged.project = path.resolve(merged.project || project);
  if (merged.llm && !merged.llm.model) merged.llm.model = 'gpt-4o-mini';
  return merged;
}

/** 解析 JSONC：去掉行注释与块注释（保留字符串内的注释字符） */
export function parseJsonc(text: string): Record<string, unknown> {
  let out = '';
  let inString = false;
  let quote = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (inString) {
      out += c;
      if (c === '\\' && next) { out += next; i++; continue; }
      if (c === quote) inString = false;
      continue;
    }
    if (c === '"' || c === "'") { inString = true; quote = c; out += c; continue; }
    if (c === '/' && next === '/') { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++;
      continue;
    }
    out += c;
  }
  try {
    return JSON.parse(out) as Record<string, unknown>;
  } catch (e) {
    throw new Error('配置文件不是合法 JSON/JSONC: ' + (e as Error).message);
  }
}

/** 深合并：对象递归，数组/标量覆盖 */
function deepMerge(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const res: Record<string, unknown> = { ...a };
  for (const k of Object.keys(b)) {
    const bv = b[k];
    const av = res[k];
    if (bv && typeof bv === 'object' && !Array.isArray(bv) && av && typeof av === 'object' && !Array.isArray(av)) {
      res[k] = deepMerge(av as Record<string, unknown>, bv as Record<string, unknown>);
    } else {
      res[k] = bv;
    }
  }
  return res;
}

/** 从环境变量读 LLM 配置 */
export function llmFromEnv(): LlmConfig | undefined {
  const key = process.env.OPENAI_API_KEY || process.env.I18N_LLM_API_KEY;
  if (!key) return undefined;
  return {
    provider: 'openai',
    baseURL: process.env.OPENAI_BASE_URL || process.env.I18N_LLM_BASE_URL || 'https://api.openai.com/v1',
    apiKey: key,
    model: process.env.I18N_LLM_MODEL || 'gpt-4o-mini',
    timeoutMs: Number(process.env.I18N_LLM_TIMEOUT || 60000)
  };
}
