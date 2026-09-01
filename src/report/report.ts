/**
 * 报告生成：Markdown 报告 + 控制台摘要。
 */
import * as fs from 'fs';
import * as path from 'path';
import { Stats, ValidationIssue, StringCandidate } from '../types';

export interface ReportData {
  project: string;
  timestamp: string;
  stats: Stats;
  issues: ValidationIssue[];
  /** review 队列 */
  reviewItems: { relFile: string; line: number; col: number; text: string; reason: string }[];
  /** 分类统计：reason -> count */
  reasonCounts: Record<string, number>;
  /** 已替换文件列表 */
  replacedFiles: string[];
  /** 各语言 key 数 */
  localeCounts: Record<string, number>;
  /** 变更前后示例 */
  samples: { relFile: string; before: string; after: string; key: string }[];
}

export function generateMarkdownReport(data: ReportData): string {
  const s = data.stats;
  const lines: string[] = [];
  lines.push('# 代码国际化智能体报告');
  lines.push('');
  lines.push('- 项目: `' + data.project + '`');
  lines.push('- 生成时间: ' + data.timestamp);
  lines.push('');
  lines.push('## 统计');
  lines.push('');
  lines.push('| 指标 | 数值 |');
  lines.push('| --- | --- |');
  lines.push('| 扫描文件数 | ' + s.filesScanned + ' |');
  lines.push('| 硬编码字符串候选 | ' + s.candidates + ' |');
  lines.push('| 保留（keep） | ' + s.keep + ' |');
  lines.push('| 跳过（skip） | ' + s.skip + ' |');
  lines.push('| 待审阅（review） | ' + s.review + ' |');
  lines.push('| 生成 key 数 | ' + s.keysCreated + ' |');
  lines.push('| 替换文件数 | ' + s.replacedFiles + ' |');
  lines.push('| 替换处数 | ' + s.replacements + ' |');
  lines.push('| 已翻译条目 | ' + s.translated + ' |');
  lines.push('| 未翻译条目 | ' + s.untranslated + ' |');
  lines.push('| 验证问题数 | ' + s.issues + ' |');
  lines.push('');
  if (data.replacedFiles.length > 0) {
    lines.push('## 已替换文件');
    lines.push('');
    for (const f of data.replacedFiles) lines.push('- `' + f + '`');
    lines.push('');
  }
  if (Object.keys(data.localeCounts).length > 0) {
    lines.push('## 语言资源');
    lines.push('');
    for (const [loc, n] of Object.entries(data.localeCounts)) lines.push('- `' + loc + '.json`: ' + n + ' keys');
    lines.push('');
  }
  if (data.samples.length > 0) {
    lines.push('## 替换示例');
    lines.push('');
    for (const sm of data.samples.slice(0, 10)) {
      lines.push('### ' + sm.key + '  (' + sm.relFile + ')');
      lines.push('```diff');
      lines.push('- ' + sm.before);
      lines.push('+ ' + sm.after);
      lines.push('```');
      lines.push('');
    }
  }
  if (data.reviewItems.length > 0) {
    lines.push('## 待人工审阅（review）');
    lines.push('');
    lines.push('| 文件 | 行 | 文本 | 原因 |');
    lines.push('| --- | --- | --- | --- |');
    for (const r of data.reviewItems.slice(0, 100)) {
      lines.push('| `' + r.relFile + '` | ' + r.line + ' | ' + JSON.stringify(r.text) + ' | ' + r.reason + ' |');
    }
    if (data.reviewItems.length > 100) lines.push('| ... 共 ' + data.reviewItems.length + ' 项 |');
    lines.push('');
  }
  if (data.issues.length > 0) {
    lines.push('## 验证问题');
    lines.push('');
    const errs = data.issues.filter((i) => i.level === 'error');
    const warns = data.issues.filter((i) => i.level === 'warning');
    lines.push('- 错误: ' + errs.length + '，警告: ' + warns.length);
    lines.push('');
    for (const i of data.issues.slice(0, 100)) {
      lines.push('- [' + i.level + '] ' + i.category + ': ' + i.message);
    }
    if (data.issues.length > 100) lines.push('- ... 共 ' + data.issues.length + ' 条');
    lines.push('');
  }
  lines.push('---');
  lines.push('*由 code-i18n-agent 自动生成*');
  lines.push('');
  return lines.join('\n');
}

/** 控制台摘要 */
export function printSummary(data: ReportData): void {
  const s = data.stats;
  console.log('');
  console.log('=== 国际化执行摘要 ===');
  console.log('扫描文件: ' + s.filesScanned + ' | 候选: ' + s.candidates + ' | keep: ' + s.keep + ' | skip: ' + s.skip + ' | review: ' + s.review);
  console.log('生成 key: ' + s.keysCreated + ' | 替换文件: ' + s.replacedFiles + ' | 替换处: ' + s.replacements);
  console.log('翻译: ' + s.translated + ' | 未翻译: ' + s.untranslated);
  const errs = data.issues.filter((i) => i.level === 'error').length;
  const warns = data.issues.filter((i) => i.level === 'warning').length;
  console.log('验证: 错误 ' + errs + ' 条, 警告 ' + warns + ' 条' + (errs > 0 ? ' (请查看报告)' : ' ✓'));
  if (data.reviewItems.length > 0) console.log('待人工审阅: ' + data.reviewItems.length + ' 项');
}

/** 写报告文件到 output/report.md */
export function writeReport(outputDir: string, markdown: string): string {
  fs.mkdirSync(outputDir, { recursive: true });
  const p = path.join(outputDir, 'report.md');
  fs.writeFileSync(p, markdown, 'utf8');
  return p;
}

/** 生成 review 队列条目 */
export function toReviewItems(cands: StringCandidate[]): ReportData['reviewItems'] {
  return cands.map((c) => ({
    relFile: c.relFile,
    line: c.line,
    col: c.col,
    text: c.text,
    reason: c.reason || 'unknown',
  }));
}
