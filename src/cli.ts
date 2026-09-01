#!/usr/bin/env node
/**
 * CLI 入口：code-i18n-agent <command> [options]
 * 命令：scan | classify | extract | translate | replace | validate | report | run | mcp
 */
import * as path from 'path';
import * as readline from 'readline';
import { loadConfig, llmFromEnv } from './config';
import { runPipeline, StepName } from './agent/pipeline';
import { logger } from './util/logger';
import { I18nAgentConfig } from './types';

const HELP = `
code-i18n-agent — 代码项目自动国际化智能体（扫描→分类→提取→翻译→替换→校验→报告）

用法:
  code-i18n-agent <command> [options]

命令:
  scan        扫描项目，统计硬编码字符串候选
  classify    启发式(+LLM)分类字符串：keep / skip / review
  extract     生成 key 与多语言资源文件
  translate   用 LLM 翻译空值条目（需要 LLM 配置）
  replace     替换源码为 t('key') 调用（可 dry-run）
  validate    校验 key/占位符/语法一致性
  report      生成 Markdown 报告
  run         全流程执行（默认）
  mcp         以 MCP Server（stdio）方式启动，供 AI 客户端调用

选项:
  --project <dir>      项目根目录（默认当前目录）
  --config <file>      配置文件路径（默认 <project>/i18n-agent.config.json）
  --locales <list>     覆盖目标语言，如 zh-CN,en-US
  --default-locale <l> 覆盖默认语言
  --dry-run            只输出改动，不写盘
  --yes / -y           跳过确认
  --resume             增量恢复（跳过未变化的已处理文件）
  --llm                使用环境变量中的 LLM 配置
  --llm-model <name>   指定模型名
  --log-level <level>  debug|info|warn|error|silent
  --help / -h          显示帮助
  --version / -v       显示版本

示例:
  code-i18n-agent scan --project fixtures/erp-demo
  code-i18n-agent run --project fixtures/erp-demo --yes
  code-i18n-agent replace --project fixtures/erp-demo --dry-run
  code-i18n-agent run --project . --locales en-US,ja-JP --llm
  code-i18n-agent mcp
`;

interface CliOptions {
  project: string;
  configFile?: string;
  locales?: string[];
  defaultLocale?: string;
  dryRun: boolean;
  yes: boolean;
  resume: boolean;
  llm: boolean;
  llmModel?: string;
  logLevel?: string;
}

function parseArgs(args: string[]): CliOptions {
  const o: CliOptions = { project: process.cwd(), dryRun: false, yes: false, resume: false, llm: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = () => args[++i];
    switch (a) {
      case '--project': o.project = next() || o.project; break;
      case '--config': o.configFile = next(); break;
      case '--locales': o.locales = (next() || '').split(',').map((s) => s.trim()).filter(Boolean); break;
      case '--default-locale': o.defaultLocale = next(); break;
      case '--dry-run': o.dryRun = true; break;
      case '--yes': case '-y': o.yes = true; break;
      case '--resume': o.resume = true; break;
      case '--llm': o.llm = true; break;
      case '--llm-model': o.llmModel = next(); break;
      case '--log-level': o.logLevel = next(); break;
      case '--help': case '-h': console.log(HELP); process.exit(0); break;
      case '--version': case '-v': console.log(require('../package.json').version); process.exit(0); break;
      default:
        if (a.startsWith('-')) { console.error('未知选项: ' + a); console.log(HELP); process.exit(1); }
        o.project = a;
    }
  }
  return o;
}

function commandToSteps(cmd: string): StepName[] {
  switch (cmd) {
    case 'scan': return ['scan'];
    case 'classify': return ['scan', 'classify'];
    case 'extract': return ['scan', 'classify', 'extract'];
    case 'translate': return ['scan', 'classify', 'extract', 'translate'];
    case 'replace': return ['scan', 'classify', 'extract', 'replace'];
    case 'validate': return ['scan', 'classify', 'validate'];
    case 'report': return ['scan', 'classify', 'extract', 'report'];
    case 'run': default: return ['scan', 'classify', 'extract', 'translate', 'replace', 'validate', 'report'];
  }
}

function ask(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question + ' ', (ans) => {
      rl.close();
      resolve(/^(y|yes|是|确定|ok)$/i.test(ans.trim()));
    });
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0] && !args[0].startsWith('-') ? args[0] : 'run';

  // `mcp` 子命令：以 MCP Server（stdio）方式启动，供 AI 客户端 / `npx code-i18n-agent mcp` 使用
  if (cmd === 'mcp') {
    const { startMcpServer } = require('./mcp-server');
    startMcpServer();
    return;
  }

  const rest = cmd === args[0] ? args.slice(1) : args;
  const opts = parseArgs(rest);

  const overrides: Partial<I18nAgentConfig> & Record<string, unknown> = {};
  if (opts.locales) overrides.locales = { dir: 'src/locales', default: opts.defaultLocale || 'zh-CN', targets: opts.locales };
  else if (opts.defaultLocale) overrides.locales = { dir: 'src/locales', default: opts.defaultLocale, targets: ['en-US'] };
  if (opts.dryRun) overrides.dryRun = true;
  if (opts.logLevel) overrides.logLevel = opts.logLevel as I18nAgentConfig['logLevel'];

  const cfg = loadConfig(opts.project, overrides);
  logger.setLevel(cfg.logLevel);

  if (!cfg.llm && (opts.llm || process.env.OPENAI_API_KEY || process.env.I18N_LLM_API_KEY)) {
    cfg.llm = llmFromEnv() || (opts.llm ? { provider: 'mock', model: 'mock-model' } : undefined);
  }
  if (opts.llmModel && cfg.llm) cfg.llm.model = opts.llmModel;
  if (opts.llmModel === 'mock' && cfg.llm) cfg.llm.provider = 'mock';

  logger.info('命令: ' + cmd + ' | 项目: ' + path.resolve(cfg.project) + (cfg.dryRun ? ' (dry-run)' : ''));
  const steps = commandToSteps(cmd);

  const confirmWrite = async (files: string[]): Promise<boolean> => {
    if (opts.yes || cfg.dryRun) return true;
    console.log('将修改以下 ' + files.length + ' 个文件：');
    for (const f of files.slice(0, 20)) console.log('  - ' + f);
    if (files.length > 20) console.log('  ... 等共 ' + files.length + ' 个');
    return ask('是否继续？(y/N)');
  };

  try {
    await runPipeline({ config: cfg, steps, resume: opts.resume, confirmWrite });
  } catch (e) {
    logger.error((e as Error).message);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});