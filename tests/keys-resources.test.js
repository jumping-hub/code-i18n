/**
 * key 生成与资源合并测试
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { fnv1a, fileSegment, slugFromText, generateKey, assignKeys } = require('../dist/extractor/keys');
const { mergeNewKeys, loadLocale, saveLocale } = require('../dist/extractor/resources');

test('fnv1a produces stable hash', () => {
  assert.strictEqual(fnv1a('hello'), fnv1a('hello'));
  assert.notStrictEqual(fnv1a('hello'), fnv1a('world'));
});

test('fileSegment and slug', () => {
  assert.strictEqual(fileSegment('src/views/SalesOrder.vue'), 'src.views.SalesOrder');
  assert.strictEqual(fileSegment('src/a-b/c.ts'), 'src.a_b.c');
  assert.ok(slugFromText('保存成功').length > 0);
  assert.strictEqual(slugFromText('Save Order Now'), 'save_order');
});

test('generateKey stable and unique', () => {
  const k1 = generateKey('src/a.ts', '保存', 0, 'semantic');
  const k2 = generateKey('src/a.ts', '保存', 0, 'semantic');
  assert.strictEqual(k1, k2, 'same text same key');
  const k3 = generateKey('src/a.ts', '删除', 1, 'semantic');
  assert.notStrictEqual(k1, k3);
  assert.ok(k1.startsWith('src.a.'), 'key starts with file segment');
});

test('assignKeys reuses keys for same text', () => {
  const cands = [
    { id: 'a', relFile: 'src/a.ts', text: '保存' },
    { id: 'b', relFile: 'src/b.ts', text: '保存' },
    { id: 'c', relFile: 'src/c.ts', text: '删除' },
  ];
  const { byId, byKey } = assignKeys(cands, 'semantic');
  assert.strictEqual(byId.get('a'), byId.get('b'), 'same text same key');
  assert.notStrictEqual(byId.get('a'), byId.get('c'));
  assert.strictEqual(byKey.size, 2, 'two unique keys');
});

test('mergeNewKeys preserves existing translations', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-merge-'));
  saveLocale(dir, 'zh-CN', { old: '旧文本' });
  saveLocale(dir, 'en-US', { old: 'Old text' });
  const entries = [
    { key: 'old', source: '旧文本', placeholders: [], files: ['a.ts'] },
    { key: 'new', source: '新文本', placeholders: [], files: ['a.ts'] },
  ];
  mergeNewKeys(dir, 'zh-CN', ['en-US'], entries);
  const zh = loadLocale(dir, 'zh-CN');
  const en = loadLocale(dir, 'en-US');
  assert.strictEqual(zh.old, '旧文本', 'keeps source');
  assert.strictEqual(en.old, 'Old text', 'keeps existing translation');
  assert.strictEqual(zh.new, '新文本', 'adds new source');
  assert.strictEqual(en.new, '', 'new target empty');
  fs.rmSync(dir, { recursive: true, force: true });
});
