# 代码国际化智能体（code-i18n-agent）

一个面向**任意代码项目**的自动化国际化（i18n）智能体：自动扫描源码中的硬编码字符串、智能分类过滤、生成多语言资源文件、用 LLM 翻译、并把源码替换为国际化调用，全程可审计、可回滚、可断点续跑。不绑定具体业务领域——ERP、电商、后台、工具库等任何 Vue/React/TS/JS 项目均可使用。

## 核心特性



* **AST 精准提取**：基于 TypeScript Compiler API 提取 `.ts/.tsx/.js/.jsx/.vue/.html` 中的硬编码字符串，支持模板字符串插值、JSX 文本 / 属性、Vue 文本 / 属性 / 插值表达式

* **智能分类**：启发式规则（30+ 条）+ 可选 LLM 复审，区分 UI 文本（keep）、噪音（skip：日志 / URL / 路径 / 标识符 / 颜色 / 正则等）、待审阅（review）

* **语义化 key**：`src.views.SalesOrder.订单列表加载.9d80bb` 风格，相同文本全局复用同一 key，内容不变 key 不变

* **安全替换**：`'文本'` → `t('key')`、`placeholder="x"` → `:placeholder="t('key')"`、`{{ x }}` → `{{ t('key') }}`；替换后自动语法校验，出错回滚；替换前自动备份 `.orig`

* **LLM 翻译**：OpenAI 兼容 API，术语表（glossary）约束，占位符（`{name}`/`{{count}}`/`%s`）自动保护与校验，翻译失败自动重试

* **工程安全**：dry-run 预览、`--yes` 确认、增量状态（`.i18n-agent/state.json`）断点恢复、防自我污染（不重复提取已替换的 key）

* **验证与报告**：key 一致性、占位符保留、替换后语法检查、Markdown 报告（统计 / 示例 / 待审阅队列 / 问题清单）

## 快速开始



```
npm install

npm run build

\# 1. 先扫描看看项目里有多少硬编码字符串（只读）

node dist/cli.js scan --project <你的项目>

\# 2. 全流程 dry-run（不写盘，预览改动）

node dist/cli.js run --project <你的项目> --dry-run

\# 3. 真实执行（自动确认，跳过询问）

node dist/cli.js run --project <你的项目> --yes

\# 4. 接入真实 LLM 翻译（需要 OPENAI\_API\_KEY 或 I18N\_LLM\_API\_KEY）

node dist/cli.js run --project <你的项目> --yes --llm
```

演示项目：`fixtures/erp-demo` 是一个包含登录 / 销售订单 / 库存 / 工作台等页面的 Vue3+TS 示例 ERP，可直接体验：



```
npm run demo
```

## CLI 命令



| 命令          | 说明                                    |
| ----------- | ------------------------------------- |
| `scan`      | 扫描项目，统计硬编码字符串候选                       |
| `classify`  | 启发式 (+LLM) 分类：keep /skip/review       |
| `extract`   | 生成 key 与多语言资源文件（`src/locales/*.json`） |
| `translate` | 用 LLM 翻译空值条目                          |
| `replace`   | 替换源码为 `t('key')` 调用                   |
| `validate`  | 校验 key / 占位符 / 语法一致性                  |
| `report`    | 生成 Markdown 报告（`output/report.md`）    |
| `run`       | 全流程执行（默认命令）                           |
| `mcp`       | 以 MCP Server（stdio）方式启动，供 AI 客户端调用      |

常用选项：`--project <dir>` `--locales en-US,ja-JP` `--dry-run` `--yes` `--resume` `--llm` `--llm-model <name>` `--log-level <level>`

## 配置

在项目根目录放 `i18n-agent.config.json`（支持 JSONC 注释）：



```
{

&#x20; "src": \["src"],                          // 扫描目录

&#x20; "ignore": \["\*\*/node\_modules/\*\*", "\*\*/dist/\*\*"],

&#x20; "extensions": \[".ts", ".tsx", ".js", ".jsx", ".vue", ".html"],

&#x20; "locales": { "dir": "src/locales", "default": "zh-CN", "targets": \["en-US"] },

&#x20; "keyStyle": "semantic",                   // semantic | hash

&#x20; "translationFn": "t",                     // 翻译函数名

&#x20; "importStatement": "import { useI18n } from 'vue-i18n'",

&#x20; "autoImport": true,                         // 自动注入 import

&#x20; "backup": true,                             // 替换前备份 .orig

&#x20; "glossary": \["银河 ERP=Galaxy ERP", "销售订单=Sales Order"],

&#x20; "llm": { "provider": "openai", "model": "gpt-4o-mini" },  // 也可用环境变量

&#x20; "llmClassify": false,                       // 是否用 LLM 复审分类

&#x20; "logLevel": "info"

}
```

LLM 也可通过环境变量配置：`OPENAI_API_KEY`（或 `I18N_LLM_API_KEY`）、`OPENAI_BASE_URL`、`I18N_LLM_MODEL`。

## 输出产物



* `src/locales/zh-CN.json`：默认语言资源（key → 中文）

* `src/locales/en-US.json` 等：目标语言资源

* `src/locales/keysMeta.json`：key 元数据（占位符、来源文件）

* `output/report.md`：执行报告

* `*.orig`：替换前的源码备份（`git status` 可看到）

* `.i18n-agent/state.json`：增量状态

## 测试



```
npm test
```

25 个单元 / 端到端测试，覆盖扫描、分类、key 生成、资源合并、替换、翻译、验证与全流程幂等性。

## MCP Server（接入 AI 编程工具）

本项目附带一个零依赖的 MCP Server（`dist/mcp-server.js`），把上述 CLI 能力以标准 **MCP（Model Context Protocol）** 工具暴露给 AI 编程客户端（Trae CN / Qoder / DSH Desktop / Cursor 等）。

### 从 npm 安装 / 使用

```bash
# 全局安装（可选，提供 code-i18n-agent / code-i18n-mcp 两个命令）
npm install -g code-i18n-agent

# 或直接 npx 一键使用（无需安装）
npx -y code-i18n-agent --help
npx -y code-i18n-agent mcp        # 以 MCP Server 方式启动
```

### 构建



```
npm run build   # 编译 src/mcp-server.ts → dist/mcp-server.js
```

### 暴露的工具



| 工具              | 说明                           | 是否写盘                    |
| --------------- | ---------------------------- | ----------------------- |
| `i18n_scan`     | 扫描项目，统计硬编码字符串候选              | 只读                      |
| `i18n_run`      | 全流程国际化（扫描→分类→提取→翻译→替换→校验→报告） | 写盘（`dry_run=true` 时仅预览） |
| `i18n_validate` | 校验 key / 占位符 / 语法一致性         | 只读                      |
| `i18n_report`   | 生成 Markdown 执行报告             | 写 `output/report.md`    |

### 在 AI 客户端中接入（stdio）

在 MCP 配置中添加 **stdio** 类型的 MCP Server，两种方式任选：

**方式一（推荐，发布后从 npm 拉起，免本地路径）：**

```json
{
  "mcpServers": {
    "code-i18n": {
      "command": "npx",
      "args": ["-y", "code-i18n-agent@latest", "mcp"]
    }
  }
}
```

**方式二（本地源码 / 未发布时）：**

```json
{
  "mcpServers": {
    "code-i18n": {
      "command": "node",
      "args": ["D:/ZCodeData/code-i18n/dist/mcp-server.js"]
    }
  }
}
```

Qoder、DSH Desktop 等在「MCP / 连接器」界面手动添加，类型选 **stdio（本地命令）**，命令为 `node`，参数为上述 `dist/mcp-server.js` 的绝对路径。

接入后即可让 AI 直接执行：



* 「扫描 D:/myapp 里的硬编码字符串」（`i18n_scan`）

* 「先 dry-run 预览 D:/myapp 的国际化改动」（`i18n_run`，`dry_run=true`）

* 「对 D:/myapp 执行完整国际化并翻译成英文」（`i18n_run`，`llm=true` + LLM 环境变量）

### 测试



```
npm run test:mcp   # MCP 冒烟测试：握手 / 工具列表 / 工具调用
```

## 技术架构

见 [docs/architecture.md](docs/architecture.md)。

## 适用与限制



* 开箱支持 Vue2/3（vue-i18n 风格 `t`/`$t`）、React（JSX `t('key')`）、原生 TS/JS、HTML

* 替换语法可通过 `translationFn`/`callStyle` 配置适配不同 i18n 库（react-i18next 的 `t('key')`、react-intl 的 `formatMessage`、Angular 的 `translate` 等）

* 模板内复杂表达式（如 `{{ a ? b : c }}`）中的字符串会提取为纯 `t('key')` 调用；动态绑定属性值（`:placeholder="'x'"`）暂不提取（按设计）

* 分类器面向中英文为主的界面文本；特殊领域可扩展 `skipPatterns`/`keepPatterns` 或开启 `llmClassify`

## License

MIT
