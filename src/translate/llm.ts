/**
 * LLM 翻译：批量翻译空值 key，术语表约束，占位符保护与校验。
 */
import { LlmClient } from '../llm/client';
import { LocaleMap, loadLocale, saveLocale } from '../extractor/resources';

const BATCH = 50;

export interface TranslateOptions {
  client: LlmClient;
  localesDir: string;
  sourceLocale: string;
  targetLocale: string;
  glossary: string[];
  placeholderSyntaxes: string[];
  /** 只翻译空值（默认 true） */
  onlyEmpty?: boolean;
  /** 批次最大条数 */
  batchSize?: number;
  /** 用于验证占位符的 key 元数据：key -> placeholders */
  keyPlaceholders?: Record<string, string[]>;
}

export interface TranslateResult {
  translated: number;
  failed: number;
  skipped: number;
}

/** 提取文本中的占位符（按配置语法） */
export function extractPlaceholders(text: string, syntaxes: string[]): Set<string> {
  const out = new Set<string>();
  if (syntaxes.includes('{}')) {
    for (const m of text.matchAll(/\{([a-zA-Z_$][\w$]*)\}/g)) out.add('{' + m[1] + '}');
  }
  if (syntaxes.includes('{{}}')) {
    for (const m of text.matchAll(/\{\{\s*([a-zA-Z_$][\w$]*)\s*\}\}/g)) out.add('{{' + m[1] + '}}');
  }
  if (syntaxes.includes('%s')) {
    for (const m of text.matchAll(/%(s|d|f|i|o|x|u|n)/g)) out.add(m[0]);
  }
  return out;
}

/** 校验翻译是否保留占位符；返回缺失/多余 */
export function checkPlaceholders(src: string, translated: string, syntaxes: string[]): string[] {
  const a = extractPlaceholders(src, syntaxes);
  const b = extractPlaceholders(translated, syntaxes);
  const missing: string[] = [];
  for (const p of a) if (!b.has(p)) missing.push(p);
  return missing;
}

/** 构建翻译 prompt（含术语表） */
function buildSystemPrompt(glossary: string[], targetLocale: string): string {
  const parts = [
    '你是资深软件本地化翻译专家。把软件界面文本从源语言翻译成 ' + targetLocale + ' 语言。',
    '要求：',
    '1. 保持自然、专业，符合目标语言软件界面习惯',
    '2. 绝对不要翻译、改动、删除任何占位符（如 {name}、{{count}}、%s、%d 等），保持其原样',
    '3. 不要添加多余的解释或注释',
    '4. 只输出 JSON 对象，键为原始字符串 id，值为翻译结果',
  ];
  if (glossary.length > 0) {
    parts.push('5. 术语表（必须严格使用这些翻译）：');
    for (const g of glossary) parts.push('   - ' + g);
  }
  return parts.join('\n');
}

/** 执行一轮翻译（多批） */
export async function translateLocale(opts: TranslateOptions): Promise<TranslateResult> {
  const source = loadLocale(opts.localesDir, opts.sourceLocale);
  const target = loadLocale(opts.localesDir, opts.targetLocale);
  const onlyEmpty = opts.onlyEmpty ?? true;
  const batchSize = opts.batchSize ?? BATCH;

  const jobs: { id: string; src: string; ph: string[] }[] = [];
  for (const [key, src] of Object.entries(source)) {
    const cur = target[key];
    if (onlyEmpty && cur && cur.trim().length > 0) continue;
    if (!src || !src.trim()) continue;
    const ph = opts.keyPlaceholders?.[key] || [];
    jobs.push({ id: key, src, ph });
  }
  if (jobs.length === 0) return { translated: 0, failed: 0, skipped: 0 };

  let translated = 0;
  let failed = 0;
  const system = buildSystemPrompt(opts.glossary, opts.targetLocale);

  for (let i = 0; i < jobs.length; i += batchSize) {
    const batch = jobs.slice(i, i + batchSize);
    const userLines = batch.map((j) => {
      const phHint = j.ph.length > 0 ? ' (占位符: ' + j.ph.join(', ') + ')' : '';
      return JSON.stringify(j.id) + ': ' + JSON.stringify(j.src) + phHint;
    });
    let result: Record<string, string> = {};
    let attempt = 0;
    for (; attempt < 2; attempt++) {
      try {
        result = await opts.client.chatJson<Record<string, string>>([
          { role: 'system', content: system },
          { role: 'user', content: '请翻译以下界面文本（保持占位符原样）：\n' + userLines.join('\n') },
        ], { temperature: 0.3 });
        break;
      } catch (e) {
        if (attempt === 1) {
          failed += batch.length;
          break;
        }
      }
    }
    if (attempt >= 2) continue;
    for (const j of batch) {
      const tr = result[j.id];
      if (typeof tr !== 'string' || tr.trim().length === 0) {
        failed++;
        continue;
      }
      const missing = checkPlaceholders(j.src, tr, opts.placeholderSyntaxes);
      if (missing.length > 0) {
        // 重试一次
        const retry = await retryTranslate(opts.client, system, j, missing);
        if (retry && checkPlaceholders(j.src, retry, opts.placeholderSyntaxes).length === 0) {
          target[j.id] = retry;
          translated++;
        } else {
          failed++;
        }
        continue;
      }
      target[j.id] = tr;
      translated++;
    }
  }

  saveLocale(opts.localesDir, opts.targetLocale, target);
  return { translated, failed, skipped: jobs.length - translated - failed };
}

async function retryTranslate(
  client: LlmClient,
  system: string,
  job: { id: string; src: string },
  missing: string[]
): Promise<string | null> {
  try {
    const r = await client.chatJson<Record<string, string>>([
      { role: 'system', content: system },
      { role: 'user', content:
        '上次翻译丢失了占位符：' + missing.join(', ') + '。请重新翻译，确保这些占位符原样保留。\n'
        + JSON.stringify(job.id) + ': ' + JSON.stringify(job.src) },
    ], { temperature: 0.2 });
    return r[job.id] || null;
  } catch {
    return null;
  }
}
