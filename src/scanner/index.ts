/**
 * 扫描器统一入口：对单个源码文件提取硬编码字符串候选。
 * 处理 .ts/.tsx/.js/.jsx（TS AST）与 .vue/.html（脚本 + 模板）。
 */
import * as path from 'path';
import * as ts from 'typescript';
import { StringCandidate } from '../types';
import { extractTsCandidates, scriptKindFor } from './extract';
import { extractTemplateCandidates, splitVueSfc } from './template';
import { walkSourceFiles } from './walk';

/**
 * 对单个文件提取候选。
 * @param absFile 绝对路径
 * @param relFile 相对项目根路径（正斜杠）
 * @param source 文件源码
 */
export function extractFileCandidates(absFile: string, relFile: string, source: string): StringCandidate[] {
  const ext = path.extname(absFile).toLowerCase();
  if (ext === '.vue') {
    const { script, scriptStart, template, templateStart } = splitVueSfc(source);
    const out: StringCandidate[] = [];
    if (script !== null && script.trim().length > 0) {
      const tsCands = extractTsCandidates(absFile, relFile, script, ts.ScriptKind.TS);
      // 偏移量需要从 script 内部坐标映射回文件坐标
      for (const c of tsCands) {
        c.start += scriptStart;
        c.end += scriptStart;
        // 重算行列（近似：行号基于 script 内部，这里重算）
        const prefix = source.slice(0, c.start);
        const lc = lineCol(prefix);
        c.line = lc.line;
        c.col = lc.col;
        out.push(c);
      }
    }
    if (template !== null) {
      const tCands = extractTemplateCandidates(absFile, relFile, template, true);
      for (const c of tCands) {
        c.start += templateStart;
        c.end += templateStart;
        // 属性替换的额外偏移也要映射回文件坐标
        const extra = c as StringCandidate & { attrStart?: number; attrValueEnd?: number };
        if (extra.attrStart !== undefined) extra.attrStart += templateStart;
        if (extra.attrValueEnd !== undefined) extra.attrValueEnd += templateStart;
        const prefix = source.slice(0, c.start);
        const lc = lineCol(prefix);
        c.line = lc.line;
        c.col = lc.col;
        out.push(c);
      }
    }
    // 去重排序
    out.sort((a, b) => a.start - b.start);
    return out;
  }
  if (ext === '.html') {
    return extractTemplateCandidates(absFile, relFile, source, false);
  }
  // ts/js/tsx/jsx
  return extractTsCandidates(absFile, relFile, source, scriptKindFor(ext));
}

function lineCol(prefix: string): { line: number; col: number } {
  let line = 1;
  let col = 1;
  for (const ch of prefix) {
    if (ch === '\n') { line++; col = 1; } else col++;
  }
  return { line, col };
}

/** 扫描整个项目：返回所有文件的候选（按文件分组） */
export interface ScanResult {
  files: { relFile: string; absFile: string; candidates: StringCandidate[] }[];
  totalCandidates: number;
}

export function scanProject(
  projectRoot: string,
  opts: { extensions: string[]; ignore: string[]; src: string[] }
): ScanResult {
  const relFiles = walkSourceFiles(projectRoot, { extensions: opts.extensions, ignore: opts.ignore, src: opts.src });
  const files: ScanResult['files'] = [];
  let total = 0;
  for (const rel of relFiles) {
    const abs = path.join(projectRoot, rel);
    const source = readUtf8(abs);
    const cands = extractFileCandidates(abs, rel, source);
    total += cands.length;
    files.push({ relFile: rel, absFile: abs, candidates: cands });
  }
  return { files, totalCandidates: total };
}

function readUtf8(abs: string): string {
  const buf = require('fs').readFileSync(abs);
  // 兼容 BOM
  return buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf ? buf.toString('utf8', 3) : buf.toString('utf8');
}