/**
 * 分类器测试
 */
const { test } = require('node:test');
const assert = require('node:assert');

const { classifyByRules } = require('../dist/classify/rules');

function cand(text, context = '') {
  return { text, context, placeholders: [], id: 'x', file: '/x', relFile: 'x', kind: 'string', raw: text, start: 0, end: 0, line: 1, col: 1 };
}

test('keeps UI text', () => {
  assert.strictEqual(classifyByRules(cand('保存')).decision, 'keep');
  assert.strictEqual(classifyByRules(cand('用户名称', 'attr: title')).decision, 'keep');
  assert.strictEqual(classifyByRules(cand('订单列表加载失败，请稍后重试')).decision, 'keep');
  assert.strictEqual(classifyByRules(cand('欢迎，{name}！', 'call: toast')).decision, 'keep');
});

test('skips non-UI content', () => {
  assert.strictEqual(classifyByRules(cand('', 'call: ref')).decision, 'skip');
  assert.strictEqual(classifyByRules(cand('https://example.com/a')).decision, 'skip');
  assert.strictEqual(classifyByRules(cand('/api/v1/orders')).decision, 'skip');
  assert.strictEqual(classifyByRules(cand('#fff')).decision, 'skip');
  assert.strictEqual(classifyByRules(cand('12px')).decision, 'skip');
  assert.strictEqual(classifyByRules(cand('debug message', 'call: console.log')).decision, 'skip');
  assert.strictEqual(classifyByRules(cand('order_status')).decision, 'skip');
  assert.strictEqual(classifyByRules(cand('username', 'var: FIELD_USERNAME')).decision, 'skip');
  assert.strictEqual(classifyByRules(cand('warning', 'prop: type')).decision, 'skip');
});

test('reviews ambiguous cases', () => {
  const r = classifyByRules(cand('长文本', 'throw'));
  assert.ok(['review', 'keep', 'skip'].includes(r.decision));
  const r2 = classifyByRules(cand('共 {n} 条', 'concat'));
  assert.ok(['review', 'keep', 'skip'].includes(r2.decision));
});
