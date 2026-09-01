/**
 * 替换器测试
 */
const { test } = require('node:test');
const assert = require('node:assert');

const { planForCandidate, replaceFile, validateScriptSyntax } = require('../dist/extractor/replacer');
const { defaultConfig } = require('../dist/config');

function mkCand(over = {}) {
  return Object.assign({
    id: 'x:0', file: '/x/a.ts', relFile: 'src/a.ts', kind: 'string',
    text: '保存', raw: "'保存'", start: 10, end: 14, line: 1, col: 1,
    context: 'call: toast', placeholders: [], decision: 'keep', key: 'src.a.保存.abc123',
  }, over);
}

test('planForCandidate generates call styles', () => {
  const cfg = defaultConfig('/x');
  const s = mkCand({ kind: 'string' });
  assert.strictEqual(planForCandidate(s, cfg, 'vue').text, "t('src.a.保存.abc123')");
  const tpl = mkCand({ kind: 'template', placeholders: ['name'], placeholderExprs: ['user.name'], text: '欢迎{name}' });
  const p2 = planForCandidate(tpl, cfg, 'vue');
  assert.strictEqual(p2.text, "t('src.a.保存.abc123', { name: user.name })");
  const jsxText = mkCand({ kind: 'jsx-text' });
  assert.strictEqual(planForCandidate(jsxText, cfg, 'vue').text, "{t('src.a.保存.abc123')}");
  const htmlText = mkCand({ kind: 'html-text' });
  assert.strictEqual(planForCandidate(htmlText, cfg, 'vue').text, "{{ t('src.a.保存.abc123') }}");
  const htmlAttr = mkCand({ kind: 'html-attr', attrName: 'placeholder', attrStart: 5, attrValueEnd: 20 });
  assert.strictEqual(planForCandidate(htmlAttr, cfg, 'vue').text, ":placeholder=\"t('src.a.保存.abc123')\"");
  const vueInterp = mkCand({ kind: 'html-text', context: 'vue-interp' });
  assert.strictEqual(planForCandidate(vueInterp, cfg, 'vue').text, "t('src.a.保存.abc123')");
});

test('replaceFile replaces and injects import', () => {
  const cfg = defaultConfig('/x');
  cfg.autoImport = true;
  cfg.importStatement = "import { useI18n } from 'vue-i18n'";
  const src = "const msg = '保存成功'\n";
  const cand = mkCand({ start: 12, end: 18, text: '保存成功', raw: "'保存成功'", key: 'k.save' });
  const out = replaceFile(src, [cand], cfg);
  assert.strictEqual(out.count, 1);
  assert.ok(out.content.includes("t('k.save')"), 'replaced with t()');
  assert.ok(out.content.includes('vue-i18n'), 'import injected');
  assert.strictEqual(out.syntaxErrors.length, 0);
});

test('replaceFile does not inject import when t already used', () => {
  const cfg = defaultConfig('/x');
  cfg.autoImport = true;
  cfg.importStatement = "import { useI18n } from 'vue-i18n'";
  // 源码已有 t 引用（如已有 import），不应重复注入
  const src = "import { useI18n } from 'vue-i18n'\nconst a = t('x.y')\nconst msg = '保存成功'\n";
  const cand = mkCand({ start: 66, end: 72, text: '保存成功', raw: "'保存成功'", key: 'k.save' });
  const out = replaceFile(src, [cand], cfg);
  assert.strictEqual(out.count, 1);
  const imports = out.content.match(/import [^\n]+/g) || [];
  assert.strictEqual(imports.length, 1, 'no duplicate import');
});

test('validateScriptSyntax detects errors', () => {
  assert.strictEqual(validateScriptSyntax("const a = 1\n", 'a.ts').length, 0);
  assert.ok(validateScriptSyntax("const = ", 'a.ts').length > 0, 'broken syntax detected');
  assert.strictEqual(validateScriptSyntax('<template><div>x</div></template>', 'a.vue').length, 0);
});