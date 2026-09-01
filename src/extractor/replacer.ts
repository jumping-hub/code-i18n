/**
 * 源码替换器：把硬编码字符串替换为 t('key') 调用。
 * - 脚本字符串/模板字符串 → t('key', {v})
 * - JSX 文本/属性 → {t('key')} / attr={t('key')}
 * - Vue/HTML 文本 → {{ t('key') }}
 * - Vue/HTML 属性 → :attr="t('key')"（整体替换 attr="x"）
 * - 自动注入 import；备份 .orig；替换后语法校验，失败回滚。
 */
import * as ts from 'typescript';
import * as path from 'path';
import { I18nAgentConfig, StringCandidate } from '../types';
import { logger } from '../util/logger';

export interface PlannedReplacement {
  candidate: StringCandidate;
  start: number;
  end: number;
  text: string;
}

export interface ReplacePlan {
  content: string;
  replacements: PlannedReplacement[];
  injectImport: boolean;
  importText: string;
}

/** 构造 t('key', {v: expr}) 参数 */
function buildCall(c: StringCandidate, fn: string, key: string): string {
  let call = fn + "('" + key + "'";
  if (c.placeholders.length > 0) {
    const pairs = c.placeholders.map((p, i) => {
      const expr = c.placeholderExprs && c.placeholderExprs[i] ? c.placeholderExprs[i] : p;
      return p + ': ' + expr;
    });
    call += ', { ' + pairs.join(', ') + ' }';
  }
  call += ')';
  return call;
}

/**
 * 为单个候选生成替换计划（返回 null 表示不可替换）。
 * framework: 'vue' | 'html' 决定属性/文本替换语法。
 */
export function planForCandidate(
  c: StringCandidate,
  cfg: I18nAgentConfig,
  framework: 'vue' | 'html'
): PlannedReplacement | null {
  if (!c.key) return null;
  const fn = cfg.translationFn;
  const call = buildCall(c, fn, c.key);
  switch (c.kind) {
    case 'string':
    case 'template':
      return { candidate: c, start: c.start, end: c.end, text: call };
    case 'jsx-text':
      return { candidate: c, start: c.start, end: c.end, text: '{' + call + '}' };
    case 'jsx-attr':
      // 替换引号字符串为表达式容器
      return { candidate: c, start: c.start, end: c.end, text: '{' + call + '}' };
    case 'html-text':
      // vue-interp：插值表达式内部，直接使用 t('key') 不包 {{ }}
      if (c.context === 'vue-interp') return { candidate: c, start: c.start, end: c.end, text: call };
      return { candidate: c, start: c.start, end: c.end, text: '{{ ' + call + ' }}' };
    case 'html-attr': {
      const attrName = (c as unknown as { attrName?: string }).attrName;
      if (!attrName) return null;
      const attrStart = (c as unknown as { attrStart?: number }).attrStart;
      const attrValueEnd = (c as unknown as { attrValueEnd?: number }).attrValueEnd;
      if (attrStart === undefined || attrValueEnd === undefined) return null;
      if (framework === 'vue') {
        return { candidate: c, start: attrStart, end: attrValueEnd, text: ':' + attrName + '="' + call + '"' };
      }
      // 纯 HTML：用 {{ t('key') }} 语法（配合模板引擎）
      return { candidate: c, start: attrStart, end: attrValueEnd, text: attrName + '="{{ ' + call + ' }}"' };
    }
  }
  return null;
}

/**
 * 为整个文件生成替换计划（按位置降序应用）。
 */
export function planFileReplacements(
  source: string,
  cands: StringCandidate[],
  cfg: I18nAgentConfig
): ReplacePlan {
  const framework: 'vue' | 'html' = cands.some((c) => c.kind === 'html-text' || c.kind === 'html-attr') && cands[0]?.relFile.endsWith('.vue') ? 'vue' : 'html';
  const plans = cands
    .map((c) => planForCandidate(c, cfg, framework))
    .filter((p): p is PlannedReplacement => p !== null)
    .sort((a, b) => b.start - a.start);

  let content = source;
  for (const p of plans) {
    content = content.slice(0, p.start) + p.text + content.slice(p.end);
  }

  // import / init 注入判断：检查替换前源码是否已引用翻译函数（避免重复注入）
  let injectImport = false;
  let injectInit = false;
  if (cfg.autoImport && plans.length > 0) {
    const fnRe = new RegExp('\\b' + escapeRegExp(cfg.translationFn) + '\\b');
    if (cfg.importStatement && !fnRe.test(source)) injectImport = true;
    if (cfg.initStatement && !normalize(source).includes(normalize(cfg.initStatement))) injectInit = true;
  }
  if (injectImport || injectInit) {
    let inject = '';
    if (injectImport) inject += cfg.importStatement + '\n';
    if (injectInit) inject += cfg.initStatement + '\n';
    const rel = cands[0]?.relFile || '';
    if (rel.endsWith('.vue')) {
      const scriptOpen = /<script[^>]*>/.exec(content);
      if (scriptOpen) {
        const at = scriptOpen.index + scriptOpen[0].length;
        content = content.slice(0, at) + '\n' + inject + content.slice(at);
      }
    } else {
      // 去掉 BOM 后插入到文件开头
      const bom = content.charCodeAt(0) === 0xfeff ? 1 : 0;
      content = content.slice(0, bom) + inject + content.slice(bom);
    }
  }
  return { content, replacements: plans, injectImport, importText: cfg.importStatement || '' };
}

function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 语法校验：脚本内容是否可解析（无语法错误） */
export function validateScriptSyntax(content: string, relFile: string): string[] {
  const ext = path.extname(relFile).toLowerCase();
  let script: string | null = content;
  let kind = ts.ScriptKind.TS;
  if (ext === '.vue') {
    const m = /<script[^>]*>([\s\S]*?)<\/script>/i.exec(content);
    script = m ? m[1] : '';
    kind = ts.ScriptKind.TS;
  } else if (ext === '.tsx') kind = ts.ScriptKind.TSX;
  else if (ext === '.jsx') kind = ts.ScriptKind.JSX;
  else if (ext === '.js' || ext === '.mjs' || ext === '.cjs') kind = ts.ScriptKind.JS;
  if (script === null || script.trim().length === 0) return [];
  const sf = ts.createSourceFile(relFile, script, ts.ScriptTarget.Latest, true, kind);
  const diags = (sf as unknown as { parseDiagnostics?: ts.Diagnostic[] }).parseDiagnostics || [];
  return diags.map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' '));
}

/**
 * 完整替换一个文件：生成计划 → 语法校验 → 返回新内容与替换统计。
 * 不写盘（由 pipeline 决定）。
 */
export function replaceFile(
  source: string,
  cands: StringCandidate[],
  cfg: I18nAgentConfig
): { content: string; count: number; syntaxErrors: string[]; injectImport: boolean } {
  const plan = planFileReplacements(source, cands, cfg);
  const errors = validateScriptSyntax(plan.content, cands[0]?.relFile || 'x.ts');
  if (errors.length > 0) {
    logger.warn('替换后语法错误，放弃该文件: ' + (cands[0]?.relFile || '') + ' -> ' + errors[0]);
    return { content: source, count: 0, syntaxErrors: errors, injectImport: false };
  }
  return {
    content: plan.content,
    count: plan.replacements.length,
    syntaxErrors: errors,
    injectImport: plan.injectImport,
  };
}