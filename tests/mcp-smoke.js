#!/usr/bin/env node
/**
 * MCP Server 冒烟测试：以标准 MCP 客户端的方式拉起 dist/mcp-server.js，
 * 依次完成 initialize → tools/list → tools/call(i18n_scan) 握手，校验协议正确性。
 *
 * 运行：node tests/mcp-smoke.js
 */
'use strict';
const cp = require('child_process');
const path = require('path');

const SERVER = path.join(__dirname, '..', 'dist', 'mcp-server.js');
const DEMO = path.join(__dirname, '..', 'fixtures', 'erp-demo');

let pendingId = 0;
const pending = new Map(); // id -> resolve
let server;
let stdoutBuf = '';

function call(method, params) {
  const id = ++pendingId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    setTimeout(() => {
      if (pending.has(id)) { pending.delete(id); reject(new Error(`等待响应超时: ${method}#${id}`)); }
    }, 60000);
  });
}

function handleLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return;
  const msg = JSON.parse(trimmed);
  if (msg.id !== undefined && msg.id !== null) {
    const entry = pending.get(msg.id);
    if (entry) { pending.delete(msg.id); msg.error ? entry.resolve({ error: msg.error }) : entry.resolve(msg.result); }
  }
}

let failures = 0;
function check(name, cond, extra) {
  if (cond) { console.log(`  ✓ ${name}`); }
  else { failures++; console.error(`  ✗ ${name}${extra ? ' — ' + extra : ''}`); }
}

async function main() {
  console.log('[MCP 冒烟测试] 启动 server: ' + SERVER);
  server = cp.spawn(process.execPath, [SERVER], { stdio: ['pipe', 'pipe', 'inherit'] });
  server.stdout.on('data', (d) => {
    stdoutBuf += d.toString();
    let idx;
    while ((idx = stdoutBuf.indexOf('\n')) >= 0) {
      const line = stdoutBuf.slice(0, idx);
      stdoutBuf = stdoutBuf.slice(idx + 1);
      try { handleLine(line); } catch (e) { console.error('[解析失败]', line, e.message); }
    }
  });
  server.on('error', (e) => { console.error('server 启动失败:', e.message); process.exit(1); });

  // 1. initialize
  const init = await call('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'mcp-smoke', version: '0.0.1' }
  });
  check('initialize 返回 protocolVersion', !!init.protocolVersion, JSON.stringify(init));
  check('initialize 声明 tools 能力', !!(init.capabilities && init.capabilities.tools), JSON.stringify(init.capabilities));
  check('initialize 返回 serverInfo', !!(init.serverInfo && init.serverInfo.name === 'code-i18n-mcp'), JSON.stringify(init.serverInfo));

  // 2. notifications/initialized（notification 无响应，只验证不报错）
  server.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  console.log('  ✓ 发送 notifications/initialized（无需响应）');

  // 3. tools/list
  const tools = await call('tools/list', {});
  check('tools/list 返回 4 个工具', Array.isArray(tools.tools) && tools.tools.length === 4, JSON.stringify((tools.tools || []).map(t => t.name)));
  const names = (tools.tools || []).map(t => t.name);
  ['i18n_scan', 'i18n_run', 'i18n_validate', 'i18n_report'].forEach(n =>
    check(`工具存在: ${n}`, names.includes(n)));
  const scanTool = (tools.tools || []).find(t => t.name === 'i18n_scan');
  check('i18n_scan 声明 project 必填', !!(scanTool && scanTool.inputSchema && scanTool.inputSchema.required && scanTool.inputSchema.required.includes('project')));

  // 4. ping
  const pong = await call('ping', {});
  check('ping 返回空 result', pong && typeof pong === 'object');

  // 5. tools/call i18n_scan（对 demo 项目，只读）
  const scanRes = await call('tools/call', { name: 'i18n_scan', arguments: { project: DEMO } });
  const text = scanRes.content && scanRes.content[0] ? scanRes.content[0].text : '';
  check('i18n_scan 返回文本内容', typeof text === 'string' && text.length > 0);
  check('i18n_scan 包含统计关键词', /扫描文件数|candidates|候选/.test(text), text.slice(0, 120));
  check('i18n_scan isError=false', scanRes.isError !== true);

  // 6. 未知工具 → isError
  const badRes = await call('tools/call', { name: 'i18n_nope', arguments: {} });
  check('未知工具返回 isError', badRes.isError === true);

  // 7. i18n_validate（只读）
  const valRes = await call('tools/call', { name: 'i18n_validate', arguments: { project: DEMO } });
  const valText = valRes.content && valRes.content[0] ? valRes.content[0].text : '';
  check('i18n_validate 返回文本内容', typeof valText === 'string' && valText.length > 0);
  check('i18n_validate 含校验信息', /验证|问题|key|OK|validate|项目/i.test(valText), valText.slice(0, 120));
  check('i18n_validate isError=false', valRes.isError !== true);

  // 8. i18n_run dry-run（不写盘）
  const runRes = await call('tools/call', { name: 'i18n_run', arguments: { project: DEMO, dry_run: true } });
  const runText = runRes.content && runRes.content[0] ? runRes.content[0].text : '';
  check('i18n_run(dry-run) 返回文本内容', typeof runText === 'string' && runText.length > 0);
  check('i18n_run(dry-run) 含统计关键词', /key|替换|统计|scan|replaced/i.test(runText), runText.slice(0, 120));
  check('i18n_run(dry-run) isError=false', runRes.isError !== true);

  // 9. 未知方法 → JSON-RPC error
  const badMethod = await call('nope/method', {});
  check('未知方法返回 MethodNotFound', badMethod && badMethod.error && badMethod.error.code === -32601, JSON.stringify(badMethod));

  server.stdin.end();
  await new Promise((r) => server.on('close', r));

  console.log(failures === 0 ? '\n[结果] 全部通过' : `\n[结果] ${failures} 项失败`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('[测试异常]', e.message); process.exit(1); });
