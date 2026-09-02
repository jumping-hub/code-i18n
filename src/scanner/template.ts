/**
 * Vue SFC template / HTML 模板文本提取器（轻量 tokenizer，无额外依赖）。
 * 提取：文本节点、静态属性值（title/placeholder/label 等白名单之外的用黑名单排除）。
 * 支持 Vue 插值 {{ expr }}：文本中的插值作为占位符 {name}。
 */
import * as ts from 'typescript';
import { StringCandidate } from '../types';

/** 不提取的属性（Vue 指令 / 事件 / 非文本属性） */
const ATTR_BLACKLIST: RegExp[] = [
  /^v-/i, // 指令
  /^@/, // 事件
  /^:/, // 动态绑定（其中含表达式的字符串字面量暂不处理）
  /^#/, // 插槽
  /^(class|style|id|ref|key|slot|scope|name|type|value)$/i,
  /^data-/i,
  /^aria-/i, // aria-* 保留？aria-label 是用户可见（读屏），保留；但 aria-hidden 无文本。保留 aria-label
];

const ATTR_KEEP_HINT = /^(title|placeholder|label|alt|message|header|footer|text|content|hint|tip|tooltip|description|confirm|confirmText|cancelText|okText|empty|loading|success|error|warning|info|aria-label)$/i;

interface RawHit {
  kind: 'html-text' | 'html-attr';
  attrName?: string;
  attrStart?: number;
  attrValueEnd?: number;
  text: string;
  raw: string;
  start: number;
  end: number;
  context: string;
  placeholders: string[];
  placeholderExprs?: string[];
}

/** 简单 HTML 实体解码 */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/**
 * 从 HTML/Vue template 提取字符串候选。
 */
export function extractTemplateCandidates(
  absFile: string,
  relFile: string,
  source: string,
  isVue: boolean
): StringCandidate[] {
  const hits: RawHit[] = [];
  let i = 0;
  const n = source.length;

  // 行号缓存（惰性计算）
  const lineStarts: number[] = [0];
  for (let k = 0; k < n; k++) if (source[k] === '\n') lineStarts.push(k + 1);
  const lineCol = (pos: number) => {
    let lo = 0, hi = lineStarts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStarts[mid] <= pos) lo = mid; else hi = mid - 1; }
    return { line: lo + 1, col: pos - lineStarts[lo] + 1 };
  };

  const skipComment = () => {
    if (source.startsWith('<!--', i)) {
      const end = source.indexOf('-->', i + 4);
      i = end === -1 ? n : end + 3;
      return true;
    }
    return false;
  };

  /** 解析标签开始 <tag ...>，返回标签名与结束位置；失败返回 null */
  function parseTagStart(): { tag: string; end: number; selfClose: boolean } | null {
    if (source[i] !== '<') return null;
    const nameM = /^<([a-zA-Z][\w:-]*)/.exec(source.slice(i));
    if (!nameM) return null;
    const tag = nameM[1].toLowerCase();
    let pos = i + nameM[0].length;
    // 遍历属性，跳过引号内的 >（避免箭头函数 =>、比较符 > 等提前截断标签）
    while (pos < n) {
      const c = source[pos];
      if (c === '"' || c === "'") {
        const quote = c;
        pos++;
        while (pos < n && source[pos] !== quote) pos++;
        if (pos < n) pos++; // 跳过闭合引号
      } else if (c === '>') {
        const selfClose = pos > 0 && source[pos - 1] === '/';
        return { tag, end: pos + 1, selfClose };
      } else {
        pos++;
      }
    }
    return null;
  }

  function parseAttrs(attrsPart: string, basePos: number): RawHit[] {
    // 遮蔽动态绑定/事件/指令（@、:、#、v-），避免其内部名称被当作静态属性解析
    attrsPart = attrsPart.replace(/(^|\s)[@:#v-][\w.:-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/g, (m, lead) => lead + ' '.repeat(m.length - lead.length));
    const res: RawHit[] = [];
    const re = /([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(attrsPart))) {
      const name = m[1];
      const nameStart = basePos + m.index;
      let value: string | undefined = m[2] ?? m[3] ?? m[4];
      if (value === undefined) continue;
      value = value.trim();
      const black = ATTR_BLACKLIST.some((re2) => re2.test(name));
      if (black) continue;
      if (value === '' || /^\s*$/.test(value)) continue;
      // 值在源码中的绝对范围（含引号）
      const eqIdx = attrsPart.indexOf('=', m.index + name.length);
      let valueStartAbs = 0;
      let valueEndAbs = 0;
      if (eqIdx >= 0) {
        const afterEq = eqIdx + 1;
        const q = attrsPart[afterEq];
        if (q === '"' || q === "'") {
          const close = attrsPart.indexOf(q, afterEq + 1);
          valueStartAbs = basePos + afterEq;
          valueEndAbs = basePos + (close >= 0 ? close + 1 : afterEq + 1);
        } else {
          valueStartAbs = basePos + afterEq;
          valueEndAbs = basePos + m.index + m[0].length;
        }
      }
      res.push({
        kind: 'html-attr',
        text: decodeEntities(value),
        raw: value,
        start: valueStartAbs,
        end: valueEndAbs,
        context: 'attr: ' + name,
        placeholders: [],
        attrName: name,
        attrStart: nameStart,
        attrValueEnd: valueEndAbs,
      });
    }
    return res;
  }
  /** 提取表达式源码中的字符串字面量（含绝对偏移） */
  function extractExprStrings(exprSrc: string, base: number): { start: number; end: number; text: string }[] {
    const sf = ts.createSourceFile('x.ts', exprSrc, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const out: { start: number; end: number; text: string }[] = [];
    function visit(n: ts.Node) {
      if (ts.isStringLiteral(n)) {
        // 跳过翻译函数调用的 key 参数（如 {{ t('key') }}）
        const p = n.parent;
        let isKey = false;
        if (p && ts.isCallExpression(p) && p.arguments[0] === n) {
          const callee = p.expression.getText(sf).trim();
          if (/(^|[\.(])(\$?t|translate|formatMessage|_)\s*\(?$/.test(callee) || /\.(t|translate|formatMessage)\s*\(?$/.test(callee)) isKey = true;
        }
        if (!isKey) out.push({ start: base + n.getStart(sf), end: base + n.getEnd(), text: n.text });
      }
      ts.forEachChild(n, visit);
    }
    visit(sf);
    return out;
  }

  /** 解析文本节点中的 Vue 插值 {{ }}，返回纯文本、占位符与内嵌字符串字面量 */
  function parseInterpolation(
    text: string,
    basePos: number
  ): { text: string; placeholders: string[]; exprs: string[]; strings: { start: number; end: number; text: string }[] } | null {
    if (!isVue || !/\{\{/.test(text)) return null;
    const re = /\{\{\s*([\s\S]*?)\s*\}\}/g;
    let out = '';
    let last = 0;
    const placeholders: string[] = [];
    const exprs: string[] = [];
    const strings: { start: number; end: number; text: string }[] = [];
    let m: RegExpExecArray | null;
    let idx = 0;
    while ((m = re.exec(text))) {
      out += text.slice(last, m.index);
      let expr = m[1].trim();
      const absExprStart = basePos + m.index + m[0].indexOf(expr);
      // 提取表达式内的字符串字面量
      for (const s of extractExprStrings(expr, absExprStart)) strings.push(s);
      // 纯字符串字面量的插值（{{ 'text' }}）直接作为纯文本
      const strM = /^(['"])([\s\S]*?)\1$/.exec(expr);
      if (strM) {
        out += strM[2];
      } else if (!/^['"]/.test(expr)) {
        let name = expr.replace(/[^\w$]/g, '_') || 'v' + idx;
        if (/^\d/.test(name)) name = 'v' + idx;
        out += '{' + name + '}';
        placeholders.push(name);
        exprs.push(expr);
        idx++;
      }
      last = m.index + m[0].length;
    }
    out += text.slice(last);
    return { text: out, placeholders, exprs, strings };
  }
  while (i < n) {
    const c = source[i];
    if (c === '<') {
      if (skipComment()) continue;
      if (/^<\//.test(source.slice(i))) {
        // 闭合标签：直接跳到 >
        const end = source.indexOf('>', i);
        i = end === -1 ? n : end + 1;
        continue;
      }
      const tagInfo = parseTagStart();
      if (!tagInfo) { i++; continue; }
      const { tag, end, selfClose } = tagInfo;
      // 跳过 script/style/textarea 内容
      if (['script', 'style', 'textarea'].includes(tag)) {
        const closeRe = new RegExp('</' + tag + '[^>]*>', 'i');
        const cm = closeRe.exec(source.slice(end));
        i = cm ? end + cm.index + cm[0].length : n;
        continue;
      }
      // 解析属性（在 <...> 内的文本）
      const inner = source.slice(i, end);
      const attrHits = parseAttrs(inner, i);
      hits.push(...attrHits);
      i = end;
      if (selfClose) continue;
      // 标签后到下一个 < 之间的文本节点
      const nextLt = source.indexOf('<', i);
      const textEnd = nextLt === -1 ? n : nextLt;
      const textRaw = source.slice(i, textEnd);
      if (textRaw.trim().length > 0) {
        const interp = parseInterpolation(textRaw, i);
        const text = interp ? interp.text : textRaw;
        const trimmed = decodeEntities(text).trim();
        // 纯插值占位符（{{ expr }} 无可见文字）不作为文本候选
        const isPurePlaceholders = /^(\{[a-zA-Z_$][\w$]*\})+$/.test(trimmed);
        if (trimmed.length > 0 && !isPurePlaceholders) {
          // 用原始 textRaw 计算范围（trim 掉首尾空白，保留插值标记的原始长度）
          const firstChar = textRaw.search(/\S/);
          const trimmedRaw = textRaw.trim();
          const startOffset = i + (firstChar >= 0 ? firstChar : 0);
          const endOffset = startOffset + trimmedRaw.length;
          hits.push({
            kind: 'html-text',
            text: trimmed,
            raw: trimmedRaw,
            start: startOffset,
            end: endOffset,
            context: 'text-node',
            placeholders: interp ? interp.placeholders : [],
            placeholderExprs: interp ? interp.exprs : undefined,
          });
        }
        // 插值表达式内的字符串字面量（{{ loading ? 'a' : 'b' }}）
        if (interp && interp.strings.length > 0) {
          for (const s of interp.strings) {
            hits.push({
              kind: 'html-text',
              text: s.text,
              raw: s.text,
              start: s.start,
              end: s.end,
              context: 'vue-interp',
              placeholders: [],
            });
          }
        }
      }
      i = textEnd;
      continue;
    }
    i++;
  }

  return hits.map((h) => {
    const lc = lineCol(h.start);
    const cand: StringCandidate = {
      id: relFile + ':' + h.start,
      file: absFile,
      relFile,
      kind: h.kind,
      text: h.text,
      raw: h.raw,
      start: h.start,
      end: h.end,
      line: lc.line,
      col: lc.col,
      context: h.context,
      placeholders: h.placeholders,
    };
    const extra = cand as StringCandidate & { attrName?: string; attrStart?: number; attrValueEnd?: number };
    if (h.attrName !== undefined) extra.attrName = h.attrName;
    if (h.attrStart !== undefined) extra.attrStart = h.attrStart;
    if (h.attrValueEnd !== undefined) extra.attrValueEnd = h.attrValueEnd;
    if (h.placeholderExprs) (cand as { placeholderExprs?: string[] }).placeholderExprs = h.placeholderExprs;
    return cand;
  });
}

/**
 * 从 Vue SFC 提取：script 部分用 TS AST，template 部分用模板提取器。
 * 返回 { candidates, scriptText, scriptStart }
 */
export function splitVueSfc(source: string): { script: string | null; scriptStart: number; template: string | null; templateStart: number } {
  const scriptM = /<script[^>]*>([\s\S]*?)<\/script>/i.exec(source);
  const tpl = extractTopLevelTemplate(source);
  return {
    script: scriptM ? scriptM[1] : null,
    scriptStart: scriptM ? scriptM.index + scriptM[0].indexOf(scriptM[1]) : -1,
    template: tpl ? tpl.content : null,
    templateStart: tpl ? tpl.start : -1,
  };
}

/** 提取 SFC 顶层 <template>（跳过具名插槽 <template #xxx>，正确处理嵌套） */
function extractTopLevelTemplate(source: string): { content: string; start: number; end: number } | null {
  const openRe = /<template(\s[^>]*)?>/gi;
  let m: RegExpExecArray | null;
  while ((m = openRe.exec(source))) {
    const attrs = m[1] || '';
    // 跳过具名插槽 <template #xxx> / <template v-slot:xxx>
    if (/#\w|v-slot/.test(attrs)) continue;
    const contentStart = m.index + m[0].length;
    let depth = 1;
    const tagRe = /<\/?template(\s[^>]*)?>/gi;
    tagRe.lastIndex = contentStart;
    let tm: RegExpExecArray | null;
    while ((tm = tagRe.exec(source))) {
      if (tm[0].startsWith('</')) {
        depth--;
        if (depth === 0) {
          return { content: source.slice(contentStart, tm.index), start: m.index, end: tm.index + tm[0].length };
        }
      } else {
        depth++;
      }
    }
    return null;
  }
  return null;
}