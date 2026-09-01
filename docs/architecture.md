# 架构设计

## 总览

智能体按 **7 个阶段** 编排（`src/agent/pipeline.ts`），每一阶段只读上游产出，可单独执行、可断点续跑：

```
scan → classify → extract → translate → replace → validate → report
扫描     分类       提取        翻译       替换       验证      报告
```

## 模块结构

```
src/
├── cli.ts                # CLI 入口（命令/参数/确认交互）
├── config.ts             # 配置加载（JSONC + 默认值深合并 + 环境变量 LLM）
├── types.ts              # 公共类型
├── llm/client.ts         # OpenAI 兼容 ChatCompletions 客户端（含 mock）
├── scanner/
│   ├── walk.ts           # 文件遍历 + glob 忽略
│   ├── extract.ts        # TS/JS/JSX AST 字符串提取（TypeScript Compiler API）
│   ├── template.ts       # Vue/HTML 模板提取（文本节点/属性/插值表达式）
│   └── index.ts          # 统一文件级提取入口（.vue = script + template）
├── classify/
│   ├── rules.ts          # 30+ 启发式规则（keep/skip/review + 置信度）
│   └── llm.ts            # LLM 批量复审（可选）
├── extractor/
│   ├── keys.ts           # key 生成（文件段 + 词根 slug + FNV-1a 哈希）
│   ├── resources.ts      # 多语言 JSON 读写/合并/keysMeta
│   └── replacer.ts       # 源码替换 + import 注入 + 语法校验回滚
├── translate/llm.ts      # 批量翻译 + 术语表 + 占位符保护/校验/重试
├── validate/validate.ts  # key 一致性/占位符/未翻译/语法验证
├── report/report.ts      # Markdown 报告 + 控制台摘要
├── agent/
│   ├── pipeline.ts       # 智能体编排（状态机 + 统计汇总）
│   └── state.ts          # 增量状态（mtime 指纹 + 阶段标记）
└── util/logger.ts        # 分级日志
```

## 关键设计

### 1. 提取（AST 优先）

- TS/JS/JSX 用 TypeScript Compiler API 遍历，收集 `StringLiteral`、模板字符串（含插值拆分）、JSX 文本/属性
- 模板字符串插值 ``欢迎，${user.name}`` → 文本 `欢迎，{name}` + 占位符 `name` + 表达式 `user.name`，替换为 `t('key', { name: user.name })`
- Vue SFC 拆为 script（AST）+ template（轻量 tokenizer）：文本节点、静态属性、`{{ expr }}` 插值（用 AST 提取表达式内的字符串字面量，如 `{{ loading ? '登录中' : '登 录' }}`）
- **排除语法噪音**：import 路径、对象 key、类型字面量、正则、枚举成员、JSX 标签名、`t('key')` 参数（防自我污染）

### 2. 分类（规则 + LLM）

每条规则有优先级、决定（keep/skip/review）与置信度。核心分组：

| 组 | 示例 | 决定 |
| --- | --- | --- |
| CJK 文本 | `保存` `订单列表加载失败` | keep（0.97） |
| UI 上下文 | `attr: placeholder` `call: ElMessage.error` `prop: confirmButtonText` | keep |
| 日志/调试 | `call: console.log` | skip |
| URL/路径/颜色/数字 | `https://…` `/api/v1` `#fff` `12px` | skip |
| 标识符 | `var: FIELD_USERNAME` `order_status` | skip |
| 待审阅 | 长文本、throw 错误、模板插值 | review |

`llmClassify: true` 时，review/低置信度项批量提交 LLM 二次判定，结果回写并记录 `reason: llm`。

### 3. Key 生成

`<文件段>.<词根slug>.<内容哈希6位>`，如 `src.views.SalesOrder.订单列表加载.9d80bb`：

- **稳定**：FNV-1a 哈希 → 文本不变 key 不变，重复执行不产生新 key
- **可读**：路径段 + 文本词根便于检索
- **复用**：全局 `text → key` 表，相同文本（如两个页面的“取消”）复用同一 key

### 4. 替换

按位置降序替换（避免偏移漂移），按字面量种类生成不同语法：

| 种类 | 原样 | 替换为 |
| --- | --- | --- |
| 脚本字符串/模板 | `'文本'` / `` `共${n}条` `` | `t('key')` / `t('key', {n})` |
| JSX 文本/属性 | `<span>文本</span>` | `{t('key')}` / `title={t('key')}` |
| Vue 文本 | `>文本<` | `{{ t('key') }}` |
| Vue 属性 | `placeholder="x"` | `:placeholder="t('key')"` |
| 插值内字符串 | `{{ a ? 'x' : 'y' }}` | `{{ a ? t('k1') : t('k2') }}` |

替换后对脚本部分做语法解析校验（`parseDiagnostics`），出错即放弃该文件并告警；首次替换前自动备份 `.orig`。

### 5. 翻译与占位符保护

- 按批（默认 50 条/批）调用 LLM，prompt 注入术语表与“保持占位符原样”指令
- 翻译后用统一语法（`{}`/`{{}}`/`%s`）提取占位符集合，与源文本比对；缺失则定向重试一次，仍失败标记为未翻译
- `mock` provider（`--llm-model mock`）可在无网络时演练全流程

### 6. 防自我污染与增量

- `isTranslationCallArg`：提取阶段跳过 `t('key')`/`i18n.t('key')`/`$t('key')` 的 key 参数——替换后的代码再次扫描不会生成嵌套 key
- `.i18n-agent/state.json` 记录每文件 mtime+size 与阶段；`--resume` 时跳过未变化的已处理文件
- 资源合并（`mergeNewKeys`）保留已有翻译，尊重人工修改

## 扩展点

| 需求 | 位置 |
| --- | --- |
| 新模板框架（Angular/AngularJS/Pug） | `scanner/template.ts` 新增提取器 + `replacer.ts` 新增语法分支 |
| 新 i18n 库 | 配置 `translationFn`/`callStyle`/`importStatement`；或扩展 `replacer.planForCandidate` |
| 新 LLM 后端 | `llm/client.ts` 实现 `provider`；翻译/分类逻辑在 `translate/llm.ts`、`classify/llm.ts` |
| 领域专属分类 | 配置 `keepPatterns`/`skipPatterns` 或扩展 `classify/rules.ts` |
| 其他语言（Java/Python） | `scanner/extract.ts` 增加对应解析器（Java 可用 javaparser，Python 用 ast） |

## 质量保障

- 替换后语法校验 + 失败回滚
- 验证器：目标语言 key 集合 = 默认语言、翻译占位符不丢失、未翻译统计、替换文件语法
- 25 个测试：`npm test`（单元 + 临时项目端到端 + 幂等性）
- 报告提供 diff 示例、待审阅队列、问题清单，支持人工复核
