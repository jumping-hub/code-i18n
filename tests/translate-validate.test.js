/**
 * 翻译与验证测试
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { extractPlaceholders, checkPlaceholders, translateLocale } = require('../dist/translate/llm');
const { LlmClient } = require('../dist/llm/client');
const { saveLocale, loadLocale } = require('../dist/extractor/resources');
const { validateI18n, countUntranslated } = require('../dist/validate/validate');

test('extractPlaceholders detects all syntaxes', () => {
  const s = extractPlaceholders('你好 {name}，共 {{count}} 条，%d 条', ['{}', '{{}}', '%s']);
  assert.ok(s.has('{name}'));
  assert.ok(s.has('{{count}}'));
  assert.ok(s.has('%d'));
});

test('checkPlaceholders flags missing', () => {
  assert.deepStrictEqual(checkPlaceholders('欢迎{name}', 'Welcome', ['{}']), ['{name}']);
  assert.deepStrictEqual(checkPlaceholders('欢迎{name}', 'Welcome {name}', ['{}']), []);
});

test('translateLocale works with mock and preserves placeholders', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-tr-'));
  saveLocale(dir, 'zh-CN', { k1: '订单列表加载失败', k2: '确定要删除订单 {orderNo} 吗？' });
  saveLocale(dir, 'en-US', { k1: '', k2: '' });
  const client = new LlmClient({ provider: 'mock', model: 'mock' });
  const res = await translateLocale({
    client, localesDir: dir, sourceLocale: 'zh-CN', targetLocale: 'en-US',
    glossary: [], placeholderSyntaxes: ['{}', '{{}}', '%s', '${}'],
    keyPlaceholders: { k2: ['orderNo'] },
  });
  assert.strictEqual(res.translated, 2);
  const en = loadLocale(dir, 'en-US');
  assert.ok(en.k1.startsWith('[mock]'));
  assert.ok(en.k2.includes('{orderNo}'), 'placeholder preserved');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('validateI18n finds missing keys and placeholders', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-v-'));
  saveLocale(dir, 'zh-CN', { a: '欢迎{name}', b: '文本' });
  saveLocale(dir, 'en-US', { a: 'Welcome' }); // missing b, lost {name}
  const issues = validateI18n({
    localesDir: dir, defaultLocale: 'zh-CN', targets: ['en-US'],
    placeholderSyntaxes: ['{}'], replacedFiles: new Map(), reviewCandidates: [],
  });
  const errs = issues.filter((i) => i.level === 'error');
  assert.ok(errs.some((i) => i.category === 'key-missing'), 'missing key found');
  assert.ok(errs.some((i) => i.category === 'placeholder'), 'placeholder issue found');
  fs.rmSync(dir, { recursive: true, force: true });
});
