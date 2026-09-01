/**
 * 验证器：key 一致性、占位符保留、未翻译检查、替换后语法检查。
 */
import * as fs from 'fs';
import * as path from 'path';
import { ValidationIssue } from '../types';
import { loadLocale, loadKeysMeta, LocaleMap } from '../extractor/resources';
import { checkPlaceholders } from '../translate/llm';
import { validateScriptSyntax } from '../extractor/replacer';

export interface ValidateOptions {
  localesDir: string;
  defaultLocale: string;
  targets: string[];
  placeholderSyntaxes: string[];
  /** 已替换的文件：relFile -> 新内容 */
  replacedFiles?: Map<string, string>;
  /** 待检查的候选（review 项） */
  reviewCandidates?: { relFile: string; line: number; text: string; reason: string }[];
}

export function validateI18n(opts: ValidateOptions): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const def = loadLocale(opts.localesDir, opts.defaultLocale);
  const defKeys = new Set(Object.keys(def));
  const meta = loadKeysMeta(opts.localesDir);

  // 1. 各目标语言 key 集合与默认语言一致
  for (const t of opts.targets) {
    const map = loadLocale(opts.localesDir, t);
    const tKeys = new Set(Object.keys(map));
    for (const k of defKeys) {
      if (!tKeys.has(k)) {
        issues.push({ level: 'error', category: 'key-missing', locale: t, key: k, message: '目标语言缺少 key: ' + k });
      } else if (!map[k] || map[k].trim().length === 0) {
        issues.push({ level: 'warning', category: 'untranslated', locale: t, key: k, message: '未翻译: ' + k });
      }
    }
    for (const k of tKeys) {
      if (!defKeys.has(k)) {
        issues.push({ level: 'warning', category: 'key-extra', locale: t, key: k, message: '目标语言多出 key（可能已删除）: ' + k });
      }
    }
  }

  // 2. 占位符一致性：翻译不得丢失占位符
  for (const t of opts.targets) {
    const map = loadLocale(opts.localesDir, t);
    for (const [k, src] of Object.entries(def)) {
      const tr = map[k];
      if (!tr) continue;
      const missing = checkPlaceholders(src, tr, opts.placeholderSyntaxes);
      if (missing.length > 0) {
        issues.push({
          level: 'error',
          category: 'placeholder',
          locale: t,
          key: k,
          message: '翻译丢失占位符 ' + missing.join(',') + ' | 源: ' + src + ' | 译: ' + tr,
        });
      }
    }
  }

  // 3. 替换后语法检查
  if (opts.replacedFiles) {
    for (const [rel, content] of opts.replacedFiles) {
      const errors = validateScriptSyntax(content, rel);
      for (const e of errors) {
        issues.push({ level: 'error', category: 'syntax', file: rel, message: '替换后语法错误: ' + e });
      }
    }
  }

  // 4. review 队列提示
  if (opts.reviewCandidates) {
    for (const r of opts.reviewCandidates) {
      issues.push({
        level: 'warning',
        category: 'review',
        file: r.relFile + ':' + r.line,
        message: '需要人工确认: ' + JSON.stringify(r.text) + ' (' + r.reason + ')',
      });
    }
  }
  return issues;
}

/** 统计未翻译数量 */
export function countUntranslated(localesDir: string, defaultLocale: string, targets: string[]): number {
  const def = loadLocale(localesDir, defaultLocale);
  let n = 0;
  for (const t of targets) {
    const map = loadLocale(localesDir, t);
    for (const k of Object.keys(def)) {
      if (!map[k] || map[k].trim().length === 0) n++;
    }
  }
  return n;
}
