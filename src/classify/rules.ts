/**
 * 启发式分类器：基于文本内容与上下文，判定 keep / skip / review。
 * 规则按优先级从高到低执行，命中即返回。
 */
import { Decision, StringCandidate } from '../types';

export interface RuleOutcome {
  decision: Decision;
  reason: string;
  confidence: number;
}

interface Rule {
  name: string;
  test: (c: StringCandidate) => boolean;
  decision: Decision;
  confidence: number;
}

/** 是否含 CJK 字符 */
export function hasCjk(s: string): boolean {
  return /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/.test(s);
}

/** 文本是否仅由空白/标点/数字/符号组成（无字母） */
function isSymbolsOnly(s: string): boolean {
  return s.length > 0 && !/[A-Za-z\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(s);
}

const CONTEXT_KEEP = /(label|placeholder|title|message|header|footer|text|content|toast|notification|alert|confirm|cancel|ok\s*text|button|btn|menu|tab|column|field|hint|tip|tooltip|empty|loading|success|error|warning|info|aria-label|alt|breadcrumb|pagination|search|filter|status|description|summary|legend|caption|title|heading)/i;

const CONTEXT_SKIP = /(console|logger|log\.|debugger|System\.out|printf|printStackTrace|assert|describe\(|it\(|test\(|expect\(|toThrow|className|style|css|data-)/i;

const RULES: Rule[] = [
  // ---------- 强跳过 ----------
  {
    name: 'empty',
    test: (c) => c.text.trim().length === 0,
    decision: 'skip',
    confidence: 1,
  },
  {
    name: 'pure-symbols',
    test: (c) => isSymbolsOnly(c.text.trim()) && c.text.trim().length <= 8,
    decision: 'skip',
    confidence: 0.98,
  },
  {
    name: 'url',
    test: (c) => /^(https?:\/\/|ftp:\/\/|www\.|mailto:|tel:|data:|blob:)/i.test(c.text.trim()),
    decision: 'skip',
    confidence: 0.98,
  },
  {
    name: 'file-path',
    test: (c) => {
      const t = c.text.trim();
      return t.length > 2 && /^[\w.\-/\\]+$/.test(t) && (/\//.test(t) || /\.(ts|js|vue|json|css|scss|png|jpg|svg|html|md|yml|yaml|xml|txt|env)$/i.test(t) || t.startsWith('./') || t.startsWith('../') || t.startsWith('/'));
    },
    decision: 'skip',
    confidence: 0.95,
  },
  {
    name: 'color',
    test: (c) => /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(c.text.trim()),
    decision: 'skip',
    confidence: 0.99,
  },
  {
    name: 'numeric-unit',
    test: (c) => /^[+-]?[\d.,]+\s*(px|em|rem|vh|vw|%|s|ms|kb|mb|gb|gbps|°c|°f|kg|g|t|m|cm|mm|元|¥|\$|€|£)?$/i.test(c.text.trim()) && /\d/.test(c.text),
    decision: 'skip',
    confidence: 0.92,
  },
  {
    name: 'hash-uuid',
    test: (c) => { const t = c.text.trim(); return t.length > 24 && !/\s/.test(t) && !hasCjk(t); },
    decision: 'skip',
    confidence: 0.9,
  },
  {
    name: 'regex-pattern',
    test: (c) => {
      const t = c.text.trim();
      return /^[\^$.*+?()[\]{}|\\/\\]+$/.test(t) && t.length >= 2;
    },
    decision: 'skip',
    confidence: 0.95,
  },
  {
    name: 'iso-date',
    test: (c) => /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(c.text.trim()),
    decision: 'skip',
    confidence: 0.9,
  },
  {
    name: 'identifier-style',
    test: (c) => {
      const t = c.text.trim();
      return /^[a-z_][a-z0-9_]*$/.test(t) && t.length >= 3 && /_/.test(t);
    },
    decision: 'skip',
    confidence: 0.85,
  },
  {
    name: 'lowercase-identifier',
    test: (c) => /^[a-z][a-z0-9]*$/.test(c.text.trim()) && c.text.trim().length >= 2,
    decision: 'skip',
    confidence: 0.7,
  },
  {
    name: 'var-identifier',
    test: (c) => {
      const ctx = c.context || '';
      const t = c.text.trim();
      return ctx.startsWith('var: ') && !hasCjk(t) && /^[\w-]+$/.test(t);
    },
    decision: 'skip',
    confidence: 0.85,
  },
  {
    name: 'prop-meta',
    test: (c) => {
      const ctx = c.context || '';
      const m = /prop: (\w+)/.exec(ctx);
      if (!m) return false;
      return /^(type|method|key|value|id|name|code|for|mode|position|placement|size|variant|shape|status|class|style|data-\w+|v-\w+)$/i.test(m[1]);
    },
    decision: 'skip',
    confidence: 0.85,
  },
  {
    name: 'concat-context',
    test: (c) => (c.context || '').startsWith('concat'),
    decision: 'skip',
    confidence: 0.7,
  },
  {
    name: 'http-call-url',
    test: (c) => {
      const ctx = c.context || '';
      return /call: (fetch|axios|http\.|request|\$http|\$axios)/.test(ctx) && (c.placeholders.length > 0 || /^\//.test(c.text.trim()) || /^(https?:)?\/\//i.test(c.text.trim()));
    },
    decision: 'skip',
    confidence: 0.9,
  },
  {
    name: 'log-context',
    test: (c) => CONTEXT_SKIP.test(c.context || ''),
    decision: 'skip',
    confidence: 0.93,
  },
  // ---------- 强保留 ----------
  {
    name: 'single-cjk',
    test: (c) => {
      const t = c.text.trim();
      return t.length === 1 && hasCjk(t);
    },
    decision: 'keep',
    confidence: 0.9,
  },
  {
    name: 'cjk-text',
    test: (c) => {
      const t = c.text.trim();
      return hasCjk(t) && t.length >= 2;
    },
    decision: 'keep',
    confidence: 0.97,
  },
  {
    name: 'ui-context',
    test: (c) => CONTEXT_KEEP.test(c.context || ''),
    decision: 'keep',
    confidence: 0.92,
  },
  {
    name: 'sentence',
    test: (c) => {
      const t = c.text.trim();
      return /[A-Za-z]/.test(t) && /\s/.test(t) && t.length >= 3 && t.length <= 120;
    },
    decision: 'keep',
    confidence: 0.78,
  },
  {
    name: 'punct-sentence',
    test: (c) => /[。！？!?：:；;]$/.test(c.text.trim()) && c.text.trim().length >= 2,
    decision: 'keep',
    confidence: 0.85,
  },
  {
    name: 'allcaps-short',
    test: (c) => /^[A-Z]{1,5}$/.test(c.text.trim()),
    decision: 'keep',
    confidence: 0.8,
  },
  {
    name: 'single-word',
    test: (c) => {
      const t = c.text.trim();
      return /^[A-Za-z][A-Za-z0-9]*$/.test(t) && t.length >= 2 && t.length <= 24 && /[aeiouAEIOU]/.test(t);
    },
    decision: 'keep',
    confidence: 0.75,
  },
  // ---------- 需要审阅 ----------
  {
    name: 'template-interp',
    test: (c) => c.placeholders.length > 0,
    decision: 'review',
    confidence: 0.6,
  },
  {
    name: 'long-text',
    test: (c) => c.text.trim().length > 120,
    decision: 'review',
    confidence: 0.5,
  },
  {
    name: 'throw-context',
    test: (c) => /(throw|new Error|assert)/.test(c.context || ''),
    decision: 'review',
    confidence: 0.55,
  },
  {
    name: 'format-string',
    test: (c) => /%(s|d|f|i|o|x|u|n|%)/.test(c.text) || /\{\{\s*\w+\s*\}\}/.test(c.text),
    decision: 'review',
    confidence: 0.6,
  },
  // ---------- 兜底 ----------
  {
    name: 'fallback',
    test: () => true,
    decision: 'skip',
    confidence: 0.5,
  },
];

/** 对单个候选分类 */
export function classifyByRules(c: StringCandidate): RuleOutcome {
  const t = c.text.trim();
  for (const rule of RULES) {
    if (rule.test(c)) {
      return { decision: rule.decision, reason: rule.name, confidence: rule.confidence };
    }
  }
  return { decision: 'skip', reason: 'fallback', confidence: 0.5 };
}

/** 批量分类：设置 decision/reason/confidence */
export function classifyAll(cands: StringCandidate[]): void {
  for (const c of cands) {
    const r = classifyByRules(c);
    c.decision = r.decision;
    c.reason = r.reason;
    c.confidence = r.confidence;
  }
}