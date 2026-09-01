/**
 * LLM 分类器：对启发式分类中 review / 低置信度项进行二次判定。
 * 批量提交（含上下文与原文），要求返回 JSON { id: decision }。
 */
import { LlmClient } from '../llm/client';
import { Decision, StringCandidate } from '../types';

const BATCH = 60;

export interface LlmClassifyOptions {
  client: LlmClient;
  /** 只处理这些 decision 的候选（默认 review） */
  only?: Decision[];
  /** 置信度阈值：低于此值的也提交（默认 0.7） */
  minConfidence?: number;
}

/** 用 LLM 复审候选集合，就地更新 decision/reason/confidence */
export async function llmClassifyCandidates(
  cands: StringCandidate[],
  opts: LlmClassifyOptions
): Promise<{ processed: number; changed: number }> {
  const only = new Set(opts.only || ['review']);
  const minConf = opts.minConfidence ?? 0.7;
  const targets = cands.filter((c) => {
    if (c.decision && only.has(c.decision)) return true;
    if (c.decision === 'review') return true;
    return (c.confidence ?? 1) < minConf && !only.size;
  });
  if (targets.length === 0) return { processed: 0, changed: 0 };

  let changed = 0;
  for (let i = 0; i < targets.length; i += BATCH) {
    const batch = targets.slice(i, i + BATCH);
    const prompt = buildPrompt(batch);
    const result = await opts.client.chatJson<Record<string, Decision>>([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ], { temperature: 0 });
    for (const c of batch) {
      const d = result[c.id];
      if (d && (d === 'keep' || d === 'skip')) {
        if (c.decision !== d) changed++;
        c.decision = d;
        c.reason = 'llm';
        c.confidence = 0.85;
      } else if (d === 'review' || d === undefined) {
        // 保持 review
        c.decision = 'review';
        c.reason = 'llm-review';
        c.confidence = 0.5;
      }
    }
  }
  return { processed: targets.length, changed };
}

const SYSTEM_PROMPT = [
  '你是前端国际化工序的审阅助手。对每个硬编码字符串，判断它是否为“用户可见的界面文本”，需要提取到 i18n 资源。',
  '规则：',
  '- keep：按钮/菜单/标题/表单标签/占位符/提示/错误提示/表格列名/状态文案等任何用户能看到的文本',
  '- skip：日志、调试信息、代码标识符、文件路径、URL、正则、CSS、日期格式、纯数字、纯符号、无意义的短字符串',
  '- review：确实无法确定',
  '只输出 JSON 对象，键为字符串 id，值为 keep/skip/review。',
].join('\n');

function buildPrompt(batch: StringCandidate[]): string {
  const lines = batch.map((c) => {
    const ctx = c.context ? ' (上下文: ' + c.context + ')' : '';
    return JSON.stringify(c.id) + ': ' + JSON.stringify(c.text) + ctx;
  });
  return '请分类以下字符串：\n' + lines.join('\n');
}
