/**
 * 端到端 pipeline 测试：在临时目录构造小项目，跑全流程。
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { runPipeline } = require('../dist/agent/pipeline');
const { defaultConfig } = require('../dist/config');

function setupProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-e2e-'));
  fs.mkdirSync(path.join(dir, 'src', 'views'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'views', 'Order.vue'), [
    '<template>',
      '<div>',
        '<h1>销售订单</h1>',
        '<button title="新增订单">新增</button>',
        '<span>共 {{ total }} 条记录</span>',
      '</div>',
    '</template>',
    '<script setup lang="ts">',
    "import { ref } from 'vue'",
    "const total = ref(0)",
    "const msg = '订单保存成功'",
    "console.log('debug')",
    "throw new Error('订单不存在')",
    '</script>'
  ].join('\n'));
  return dir;
}

test('pipeline end-to-end: extract, translate (mock), replace, validate', async () => {
  const dir = setupProject();
  const cfg = defaultConfig(dir);
  cfg.locales = { dir: 'src/locales', default: 'zh-CN', targets: ['en-US'] };
  cfg.llm = { provider: 'mock', model: 'mock' };
  cfg.dryRun = false;
  cfg.autoImport = true;
  cfg.importStatement = "import { useI18n } from 'vue-i18n'";

  const result = await runPipeline({ config: cfg, steps: ['scan','classify','extract','translate','replace','validate','report'] });
  assert.ok(result.stats.keysCreated >= 5, 'keys created: ' + result.stats.keysCreated);
  assert.ok(result.stats.replacements >= 5, 'replacements: ' + result.stats.replacements);
  assert.strictEqual(result.stats.translated, result.stats.keysCreated, 'all translated with mock');
  assert.strictEqual(result.issues.filter((i) => i.level === 'error').length, 0, 'no validation errors');

  const out = fs.readFileSync(path.join(dir, 'src', 'views', 'Order.vue'), 'utf8');
  assert.ok(out.includes("t('"), 'replaced with t() calls');
  assert.ok(out.includes('vue-i18n'), 'import injected');
  assert.ok(!out.includes("t('k."), 'no key pollution');
  assert.ok(out.includes("'debug'"), 'log string untouched');

  const result2 = await runPipeline({ config: cfg, steps: ['scan','classify','extract'] });
  assert.ok(result2.stats.keysCreated <= result.stats.keysCreated, 'no new keys on re-run: ' + result2.stats.keysCreated);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('pipeline dry-run writes nothing', async () => {
  const dir = setupProject();
  const cfg = defaultConfig(dir);
  cfg.locales = { dir: 'src/locales', default: 'zh-CN', targets: ['en-US'] };
  cfg.llm = { provider: 'mock', model: 'mock' };
  cfg.dryRun = true;

  const before = fs.readFileSync(path.join(dir, 'src', 'views', 'Order.vue'), 'utf8');
  await runPipeline({ config: cfg });
  const after = fs.readFileSync(path.join(dir, 'src', 'views', 'Order.vue'), 'utf8');
  assert.strictEqual(before, after, 'source untouched in dry-run');
  assert.ok(!fs.existsSync(path.join(dir, 'src', 'locales')), 'no locales written in dry-run');
  fs.rmSync(dir, { recursive: true, force: true });
});
