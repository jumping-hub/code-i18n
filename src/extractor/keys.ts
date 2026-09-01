/**
 * key 生成：语义化路径 + 词根 slug + 内容哈希，保证稳定、可读、唯一。
 */

/** FNV-1a 32 位哈希 → 8 位 hex（取前 6 位） */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** 相对路径 → key 段：src/views/SalesOrder.vue → src.views.SalesOrder */
export function fileSegment(relFile: string): string {
  const noExt = relFile.replace(/\.[^.]+$/, '');
  const segs = noExt.split(/[\\/]/).filter(Boolean);
  if (segs.length === 0) return 'root';
  return segs
    .map((s) => s.replace(/[^a-zA-Z0-9]/g, '_').replace(/^_+|_+$/g, '') || 'x')
    .join('.');
}

/** 文本 → slug：英文取前 2 个单词，中文取前 6 个字符 */
export function slugFromText(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (!t) return 'text';
  if (/[\u3400-\u9fff]/.test(t)) {
    return t.replace(/[^\u3400-\u9fffA-Za-z0-9]/g, '').slice(0, 6) || 'text';
  }
  const words = t
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z0-9]/g, ''))
    .filter((w) => w.length > 0);
  const picked = words.slice(0, 2).join('_');
  return picked ? picked.toLowerCase() : 'text';
}

/** 生成单个 key */
export function generateKey(
  relFile: string,
  text: string,
  index: number,
  style: 'semantic' | 'hash'
): string {
  const h = fnv1a(text).slice(0, 6);
  if (style === 'hash') return 'k_' + h;
  const seg = fileSegment(relFile);
  const slug = slugFromText(text);
  return seg + '.' + slug + '.' + h;
}

/**
 * 为候选集合分配 key：相同文本全局复用同一 key。
 * 返回 Map<id, key> 与 key 到候选的映射。
 */
export function assignKeys(
  cands: { id: string; relFile: string; text: string }[],
  style: 'semantic' | 'hash'
): { byId: Map<string, string>; byKey: Map<string, { text: string; files: string[] }> } {
  const byId = new Map<string, string>();
  const byKey = new Map<string, { text: string; files: string[] }>();
  const textToKey = new Map<string, string>();
  let globalIdx = 0;
  for (const c of cands) {
    const existing = textToKey.get(c.text);
    if (existing) {
      byId.set(c.id, existing);
      const meta = byKey.get(existing)!;
      if (!meta.files.includes(c.relFile)) meta.files.push(c.relFile);
      continue;
    }
    let key = generateKey(c.relFile, c.text, globalIdx++, style);
    let n = 1;
    while (byKey.has(key)) {
      key = generateKey(c.relFile, c.text + '\u0000' + n, globalIdx++, style) + '_' + n;
      n++;
    }
    byId.set(c.id, key);
    byKey.set(key, { text: c.text, files: [c.relFile] });
    textToKey.set(c.text, key);
  }
  return { byId, byKey };
}
