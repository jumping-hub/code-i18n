/**
 * 智能体主流程：scan → classify → extract → translate → replace → validate → report。
 * 支持 dry-run、增量恢复、LLM 可选增强。
 */
import * as fs from 'fs';
import * as path from 'path';
import { I18nAgentConfig, Stats, StringCandidate, ValidationIssue } from '../types';
import { scanProject } from '../scanner';
import { classifyAll } from '../classify/rules';
import { llmClassifyCandidates } from '../classify/llm';
import { assignKeys } from '../extractor/keys';
import { mergeNewKeys, upsertKeysMeta, loadLocale, loadKeysMeta, saveLocale } from '../extractor/resources';
import { replaceFile } from '../extractor/replacer';
import { translateLocale } from '../translate/llm';
import { validateI18n, countUntranslated } from '../validate/validate';
import { generateMarkdownReport, printSummary, toReviewItems, writeReport, ReportData } from '../report/report';
import { LlmClient } from '../llm/client';
import { loadState, saveState, AgentState, FileState, needsReprocess, fileFingerprint } from './state';
import { logger } from '../util/logger';

export type StepName = 'scan' | 'classify' | 'extract' | 'translate' | 'replace' | 'validate' | 'report';

export interface PipelineOptions {
  config: I18nAgentConfig;
  steps?: StepName[];
  resume?: boolean;
  /** 写盘前确认（返回 false 中止写入） */
  confirmWrite?: (files: string[]) => Promise<boolean>;
}

export interface PipelineResult {
  report: ReportData;
  stats: Stats;
  issues: ValidationIssue[];
  reviewItems: ReportData['reviewItems'];
  keepCandidates: StringCandidate[];
  translatedCount: number;
}

export async function runPipeline(opts: PipelineOptions): Promise<PipelineResult> {
  const cfg = opts.config;
  const steps = new Set(opts.steps || ['scan','classify','extract','translate','replace','validate','report']);
  const state: AgentState = opts.resume ? loadState(cfg.project) : { version: 1, project: cfg.project, files: {}, updatedAt: new Date().toISOString() };

  const stats: Stats = {
    filesScanned: 0, candidates: 0, keep: 0, skip: 0, review: 0,
    keysCreated: 0, replacedFiles: 0, replacements: 0, translated: 0, untranslated: 0, issues: 0,
  };
  const issues: ValidationIssue[] = [];
  const reviewItems: ReportData['reviewItems'] = [];
  const replacedFiles: string[] = [];
  const samples: ReportData['samples'] = [];
  const reasonCounts: Record<string, number> = {};

  // ---------- 1. scan ----------
  let keepCandidates: StringCandidate[] = [];
  if (steps.has('scan')) {
    logger.info('扫描项目: ' + cfg.project + ' (src: ' + cfg.src.join(',') + ')');
    const scan = scanProject(cfg.project, { extensions: cfg.extensions, ignore: cfg.ignore, src: cfg.src });
    stats.filesScanned = scan.files.length;
    stats.candidates = scan.totalCandidates;
    for (const f of scan.files) {
      const fp = fileFingerprint(f.absFile);
      state.files[f.relFile] = { mtime: fp?.mtime ?? 0, size: fp?.size ?? 0, phase: 'scanned', keepCount: 0, replacedCount: 0 };
    }
    // 清理已删除文件的状态
    for (const rel of Object.keys(state.files)) {
      if (!fs.existsSync(path.join(cfg.project, rel))) delete state.files[rel];
    }
    if (!cfg.dryRun) saveState(cfg.project, state);
    logger.info('发现 ' + stats.filesScanned + ' 个文件，候选字符串 ' + stats.candidates + ' 个');
  }

  // ---------- 2. classify ----------
  if (steps.has('classify')) {
    const scan = scanProject(cfg.project, { extensions: cfg.extensions, ignore: cfg.ignore, src: cfg.src });
    for (const f of scan.files) classifyAll(f.candidates);
    // LLM 辅助分类（可选）
    if (cfg.llm && cfg.llmClassify) {
      const client = new LlmClient(cfg.llm);
      const all = scan.files.flatMap((f) => f.candidates);
      const res = await llmClassifyCandidates(all, { client });
      logger.info('LLM 复审: ' + res.processed + ' 项，变更 ' + res.changed + ' 项');
    }
    // 统计
    let keep = 0, skip = 0, review = 0;
    for (const f of scan.files) {
      for (const c of f.candidates) {
        if (c.decision === 'keep') keep++;
        else if (c.decision === 'skip') skip++;
        else review++;
        const r = c.reason || 'unknown';
        reasonCounts[r] = (reasonCounts[r] || 0) + 1;
      }
    }
    stats.keep = keep; stats.skip = skip; stats.review = review;
    logger.info('分类: keep ' + keep + ' | skip ' + skip + ' | review ' + review);
    // 更新状态 phase
    for (const f of scan.files) {
      const s = state.files[f.relFile];
      if (s) { s.phase = 'classified'; s.keepCount = f.candidates.filter((c) => c.decision === 'keep').length; }
    }
    if (!cfg.dryRun) saveState(cfg.project, state);
  }

  // ---------- 3. extract (keys + resources) ----------
  if (steps.has('extract')) {
    const scan = scanProject(cfg.project, { extensions: cfg.extensions, ignore: cfg.ignore, src: cfg.src });
    for (const f of scan.files) classifyAll(f.candidates);
    keepCandidates = scan.files.flatMap((f) => f.candidates).filter((c) => c.decision === 'keep');
    const { byId, byKey } = assignKeys(keepCandidates.map((c) => ({ id: c.id, relFile: c.relFile, text: c.text })), cfg.keyStyle);
    for (const c of keepCandidates) c.key = byId.get(c.id);
    stats.keysCreated = byKey.size;

    // 聚合占位符
    const phByKey = new Map<string, string[]>();
    for (const c of keepCandidates) {
      if (!c.key) continue;
      const arr = phByKey.get(c.key) || [];
      for (const p of c.placeholders) if (!arr.includes(p)) arr.push(p);
      phByKey.set(c.key, arr);
    }

    const localesDir = path.join(cfg.project, cfg.locales.dir);
    const entries = [...byKey.entries()].map(([key, meta]) => ({
      key,
      source: meta.text,
      placeholders: phByKey.get(key) || [],
      files: meta.files,
    }));
    const { defaultAdded } = mergeNewKeys(localesDir, cfg.locales.default, cfg.locales.targets, entries, cfg.dryRun);
    upsertKeysMeta(localesDir, entries, cfg.dryRun);
    logger.info('生成 key ' + entries.length + ' 个（新增 ' + defaultAdded + '）→ ' + localesDir);
  }

  // ---------- 4. translate ----------
  let translatedCount = 0;
  if (steps.has('translate')) {
    const localesDir = path.join(cfg.project, cfg.locales.dir);
    const meta = loadKeysMeta(localesDir);
    const keyPlaceholders: Record<string, string[]> = {};
    for (const [k, m] of Object.entries(meta)) keyPlaceholders[k] = m.placeholders;
    if (cfg.llm) {
      const client = new LlmClient(cfg.llm);
      for (const t of cfg.locales.targets) {
        logger.info('翻译 → ' + t + ' ...');
        const res = await translateLocale({
          client,
          localesDir,
          sourceLocale: cfg.locales.default,
          targetLocale: t,
          glossary: cfg.glossary,
          placeholderSyntaxes: cfg.placeholderSyntax,
          keyPlaceholders,
        });
        translatedCount += res.translated;
        if (res.failed > 0) logger.warn('翻译失败 ' + res.failed + ' 条 (' + t + ')');
        logger.info(t + ': 翻译 ' + res.translated + ' 条, 失败 ' + res.failed + ' 条');
      }
    } else {
      logger.warn('未配置 LLM（OPENAI_API_KEY 或配置 llm），跳过翻译。可稍后执行 translate 步骤。');
    }
    const untranslated = countUntranslated(localesDir, cfg.locales.default, cfg.locales.targets);
    stats.untranslated = untranslated;
    stats.translated = translatedCount;
  }

  // ---------- 5. replace ----------
  const replacedContent = new Map<string, string>();
  if (steps.has('replace')) {
    const scan = scanProject(cfg.project, { extensions: cfg.extensions, ignore: cfg.ignore, src: cfg.src });
    for (const f of scan.files) classifyAll(f.candidates);
    const fileGroups = new Map<string, StringCandidate[]>();
    for (const f of scan.files) {
      const keep = f.candidates.filter((c) => c.decision === 'keep');
      if (keep.length > 0) fileGroups.set(f.relFile, keep);
    }
    // key 分配
    const allKeep = [...fileGroups.values()].flat();
    const { byId } = assignKeys(allKeep.map((c) => ({ id: c.id, relFile: c.relFile, text: c.text })), cfg.keyStyle);
    for (const c of allKeep) c.key = byId.get(c.id);

    const toReplace = fileGroups;
    if (toReplace.size > 0 && opts.confirmWrite && !cfg.dryRun) {
      const ok = await opts.confirmWrite([...toReplace.keys()]);
      if (!ok) {
        logger.info('用户取消写入，跳过 replace 阶段');
      } else {
        await doReplace(toReplace, cfg, stats, replacedFiles, samples, state, replacedContent);
      }
    } else {
      await doReplace(toReplace, cfg, stats, replacedFiles, samples, state, replacedContent);
    }
  }

  // ---------- 6. validate ----------
  if (steps.has('validate')) {
    const localesDir = path.join(cfg.project, cfg.locales.dir);
    const reviewCands = collectReview(scanProject(cfg.project, { extensions: cfg.extensions, ignore: cfg.ignore, src: cfg.src }));
    const vIssues = validateI18n({
      localesDir,
      defaultLocale: cfg.locales.default,
      targets: cfg.locales.targets,
      placeholderSyntaxes: cfg.placeholderSyntax,
      replacedFiles: replacedContent,
      reviewCandidates: reviewCands.map((c) => ({ relFile: c.relFile, line: c.line, text: c.text, reason: c.reason || 'review' })),
    });
    issues.push(...vIssues);
    stats.issues = vIssues.length;
    reviewItems.push(...toReviewItems(reviewCands));
  }

  // ---------- 7. report ----------
  let reportPath = '';
  if (steps.has('report')) {
    const localesDir = path.join(cfg.project, cfg.locales.dir);
    const localeCounts: Record<string, number> = {};
    for (const loc of [cfg.locales.default, ...cfg.locales.targets]) {
      localeCounts[loc] = Object.keys(loadLocale(localesDir, loc)).length;
    }
    const report: ReportData = {
      project: cfg.project,
      timestamp: new Date().toISOString(),
      stats,
      issues,
      reviewItems,
      reasonCounts,
      replacedFiles,
      localeCounts,
      samples,
    };
    const md = generateMarkdownReport(report);
    reportPath = writeReport(path.join(cfg.project, 'output'), md);
    printSummary(report);
    logger.info('报告已生成: ' + reportPath);
    if (!cfg.dryRun) saveState(cfg.project, state);
    return { report, stats, issues, reviewItems, keepCandidates, translatedCount };
  }

  if (!cfg.dryRun) saveState(cfg.project, state);
  return {
    report: { project: cfg.project, timestamp: new Date().toISOString(), stats, issues, reviewItems, reasonCounts, replacedFiles, localeCounts: {}, samples },
    stats,
    issues,
    reviewItems,
    keepCandidates,
    translatedCount,
  };
}

async function doReplace(
  fileGroups: Map<string, StringCandidate[]>,
  cfg: I18nAgentConfig,
  stats: Stats,
  replacedFiles: string[],
  samples: ReportData['samples'],
  state: AgentState,
  replacedContent: Map<string, string>,
): Promise<void> {
  for (const [rel, cands] of fileGroups) {
    const abs = path.join(cfg.project, rel);
    if (!fs.existsSync(abs)) continue;
    const source = fs.readFileSync(abs, 'utf8');
    const result = replaceFile(source, cands, cfg);
    if (result.count === 0) continue;
    if (result.syntaxErrors.length > 0) {
      stats.issues += result.syntaxErrors.length;
      continue;
    }
    // 备份
    if (cfg.backup && !cfg.dryRun && !fs.existsSync(abs + '.orig')) {
      fs.copyFileSync(abs, abs + '.orig');
    }
    if (!cfg.dryRun) {
      fs.writeFileSync(abs, result.content, 'utf8');
    }
    replacedFiles.push(rel);
    replacedContent.set(rel, result.content);
    stats.replacedFiles = replacedFiles.length;
    stats.replacements += result.count;
    const s = state.files[rel];
    if (s) { s.phase = 'replaced'; s.replacedCount = result.count; }
    // 示例（最多 5 个文件）
    if (samples.length < 5 && cands.length > 0) {
      const c = cands[0];
      const before = c.raw.length > 60 ? c.raw.slice(0, 57) + '...' : c.raw;
      const after = (c.replacement || c.key ? cfg.translationFn + "('" + c.key + "')" : '') || before;
      samples.push({ relFile: rel, before, after, key: c.key || '' });
    }
    logger.debug('替换 ' + rel + ': ' + result.count + ' 处');
  }
  logger.info('替换完成: ' + replacedFiles.length + ' 个文件, ' + stats.replacements + ' 处' + (cfg.dryRun ? ' (dry-run 未写盘)' : ''));
}

function collectReview(scan: { files: { relFile: string; candidates: StringCandidate[] }[] }): StringCandidate[] {
  const out: StringCandidate[] = [];
  for (const f of scan.files) {
    for (const c of f.candidates) {
      if (c.decision === 'review') out.push(c);
    }
  }
  return out;
}