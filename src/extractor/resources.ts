/**
 * 多语言资源文件读写与合并：
 * - locales/<locale>.json 扁平 { key: text }
 * - 合并时保留已有翻译（人工或之前 LLM 生成的），新 key 默认语言填原文，目标语言填空
 * - keysMeta.json 记录 key 元数据（占位符、来源文件）
 */
import * as fs from 'fs';
import * as path from 'path';
import { KeyMeta } from '../types';

export type LocaleMap = Record<string, string>;

export function localeFilePath(localesDir: string, locale: string): string {
  return path.join(localesDir, locale + '.json');
}

export function loadLocale(localesDir: string, locale: string): LocaleMap {
  const p = localeFilePath(localesDir, locale);
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as LocaleMap;
  } catch (e) {
    throw new Error('语言文件解析失败 ' + p + ': ' + (e as Error).message);
  }
}

export function saveLocale(localesDir: string, locale: string, data: LocaleMap, dryRun = false): void {
  if (dryRun) return;
  fs.mkdirSync(localesDir, { recursive: true });
  const sorted: LocaleMap = {};
  for (const k of Object.keys(data).sort()) sorted[k] = data[k];
  fs.writeFileSync(localeFilePath(localesDir, locale), JSON.stringify(sorted, null, 2) + '\n', 'utf8');
}

/**
 * 将新 key 合并进语言文件：
 * - 默认语言：新 key 填入源文本（已有值不动，尊重人工修改）
 * - 目标语言：新 key 保持空字符串（等待翻译）
 */
export interface NewKeyEntry {
  key: string;
  source: string;
  placeholders: string[];
  files: string[];
}

export function mergeNewKeys(
  localesDir: string,
  defaultLocale: string,
  targets: string[],
  entries: NewKeyEntry[],
  dryRun = false
): { defaultAdded: number } {
  const defaultMap = loadLocale(localesDir, defaultLocale);
  const targetMaps = new Map(targets.map((t) => [t, loadLocale(localesDir, t)]));
  let added = 0;
  for (const e of entries) {
    if (!(e.key in defaultMap)) {
      defaultMap[e.key] = e.source;
      added++;
    }
    for (const [t, map] of targetMaps) {
      if (!(e.key in map)) map[e.key] = '';
    }
  }
  saveLocale(localesDir, defaultLocale, defaultMap, dryRun);
  for (const [t, map] of targetMaps) saveLocale(localesDir, t, map, dryRun);
  return { defaultAdded: added };
}

/** keysMeta 持久化：{ key: KeyMeta } */
export function loadKeysMeta(localesDir: string): Record<string, KeyMeta> {
  const p = path.join(localesDir, 'keysMeta.json');
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as Record<string, KeyMeta>;
  } catch {
    return {};
  }
}

export function saveKeysMeta(localesDir: string, meta: Record<string, KeyMeta>): void {
  fs.mkdirSync(localesDir, { recursive: true });
  fs.writeFileSync(path.join(localesDir, 'keysMeta.json'), JSON.stringify(meta, null, 2) + '\n', 'utf8');
}

/** 更新 keysMeta：新增或更新（files 合并） */
export function upsertKeysMeta(localesDir: string, entries: NewKeyEntry[], dryRun = false): void {
  const meta = loadKeysMeta(localesDir);
  for (const e of entries) {
    const cur = meta[e.key] || { key: e.key, source: e.source, placeholders: e.placeholders, files: [] };
    cur.source = e.source;
    cur.placeholders = e.placeholders;
    for (const f of e.files) if (!cur.files.includes(f)) cur.files.push(f);
    meta[e.key] = cur;
  }
  if (!dryRun) saveKeysMeta(localesDir, meta);
}