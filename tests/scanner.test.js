/**
 * 扫描器测试：文件遍历、TS 提取、模板提取
 */
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const { globToRegExp, walkSourceFiles } = require('../dist/scanner/walk');
const { extractTsCandidates } = require('../dist/scanner/extract');
const { extractTemplateCandidates } = require('../dist/scanner/template');
const { extractFileCandidates } = require('../dist/scanner');
const ts = require('typescript');

test('globToRegExp matches paths', () => {
  assert.ok(globToRegExp('**/node_modules/**').test('a/node_modules/x/y.js'));
  assert.ok(globToRegExp('**/*.min.js').test('dist/app.min.js'));
  assert.ok(!globToRegExp('**/*.min.js').test('src/app.js'));
  assert.ok(globToRegExp('**/locales/**').test('src/locales/zh-CN.json'));
});

test('extractTsCandidates extracts strings with context', () => {
  const src = [
    "const msg = '保存成功'",
    "console.log('debug message')",
    "throw new Error('订单不存在')",
    "import { foo } from './foo'"
  ].join('\n');
  const cands = extractTsCandidates('/x/a.ts', 'a.ts', src, ts.ScriptKind.TS);
  const texts = cands.map((c) => c.text);
  assert.ok(texts.includes('保存成功'), 'extracts UI string');
  assert.ok(texts.includes('debug message'), 'extracts log string (classified later)');
  assert.ok(texts.includes('订单不存在'), 'extracts error string');
  assert.ok(!texts.includes('./foo'), 'skips import path');
});

test('extractTsCandidates skips translation call args', () => {
  const src = [
    "const a = t('already.i18n.key')",
    "const b = i18n.t('another.key')",
    "const c = $t('vue.key')",
    "const d = '真实文本'"
  ].join('\n');
  const cands = extractTsCandidates('/x/a.ts', 'a.ts', src, ts.ScriptKind.TS);
  const texts = cands.map((c) => c.text);
  assert.ok(!texts.includes('already.i18n.key'), 'skips t() key');
  assert.ok(!texts.includes('another.key'), 'skips i18n.t() key');
  assert.ok(!texts.includes('vue.key'), 'skips $t() key');
  assert.ok(texts.includes('真实文本'), 'keeps real text');
});

test('extractTsCandidates extracts template with placeholders', () => {
  const src = 'const msg = `欢迎，${user.name}，共${count}条`';
  const cands = extractTsCandidates('/x/a.ts', 'a.ts', src, ts.ScriptKind.TS);
  const tpl = cands.find((c) => c.kind === 'template');
  assert.ok(tpl, 'finds template');
  assert.strictEqual(tpl.text, '欢迎，{name}，共{count}条');
  assert.deepStrictEqual(tpl.placeholders, ['name', 'count']);
  assert.ok(tpl.placeholderExprs.includes('user.name'));
});

test('extractTemplateCandidates extracts text nodes and attrs', () => {
  const src = [
    '<div class="wrap">',
      '<span title="用户名称">刷新</span>',
      '<input placeholder="请输入用户名" />',
      '<a @click.prevent="go" href="/api">帮助</a>',
      '<div>共 {{ total }} 条</div>',
    '</div>'
  ].join('\n');
  const cands = extractTemplateCandidates('/x/a.vue', 'a.vue', src, true);
  const texts = cands.map((c) => c.text);
  assert.ok(texts.includes('刷新'), 'text node');
  assert.ok(texts.includes('请输入用户名'), 'attr value');
  assert.ok(texts.includes('用户名称'), 'title attr');
  assert.ok(texts.includes('帮助'), 'text near href');
  const pag = cands.find((c) => c.text.includes('共'));
  assert.ok(pag, 'pagination text with interpolation');
  assert.ok(pag.placeholders.includes('total'), 'interpolation placeholder');
  // /api 会被提取，但分类阶段 file-path 规则会 skip（见 classify 测试）
  assert.ok(!texts.includes('go'), 'event handler not extracted');
});

test('extractFileCandidates handles vue sfc', () => {
  const src = [
    '<template>',
      '<button>保存</button>',
    '</template>',
    '<script setup lang="ts">',
    "const msg = '编辑成功'",
    "console.log('log')",
    '</script>'
  ].join('\n');
  const cands = extractFileCandidates('/x/A.vue', 'src/A.vue', src);
  const texts = cands.map((c) => c.text);
  assert.ok(texts.includes('保存'), 'template text');
  assert.ok(texts.includes('编辑成功'), 'script text');
});

test('walkSourceFiles respects ignore and extensions', () => {
  const rootDir = path.join(__dirname, '..', 'fixtures', 'erp-demo');
  const files = walkSourceFiles(rootDir, {
    extensions: ['.vue', '.ts'],
    ignore: ['**/node_modules/**', '**/locales/**', '**/.i18n-agent/**'],
  });
  assert.ok(files.includes('src/App.vue'));
  assert.ok(files.includes('src/api/orderApi.ts'));
  assert.ok(!files.some((f) => f.includes('locales')), 'ignores locales');
});