/**
 * 测试运行器：使用 node:test run() API 进程内执行所有测试文件
 */
const { run } = require('node:test');
const path = require('node:path');

const files = ['scanner', 'classify', 'keys-resources', 'replacer', 'translate-validate', 'pipeline']
  .map((f) => path.join(__dirname, f + '.test.js'));

const stream = run({
  files,
  isolation: 'none',
  concurrency: 1,
});

let pass = 0;
let fail = 0;
stream.on('test:pass', () => { pass++; });
stream.on('test:fail', (e) => { fail++; console.error('FAIL:', e.name, e.details?.error?.message || ''); });
stream.on('end', () => {
  console.log('\n===== 测试结果: ' + pass + ' 通过, ' + fail + ' 失败 =====');
  process.exit(fail > 0 ? 1 : 0);
});
