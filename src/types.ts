/**
 * 公共类型定义：字符串候选、资源、配置等
 */

/** 字面量来源种类 */
export type LiteralKind =
  | "string" // 普通字符串字面量
  | "template" // 模板字符串，可能带插值
  | "jsx-text" // JSX 文本节点
  | "jsx-attr" // JSX 属性值
  | "html-text" // HTML/Vue template 文本节点
  | "html-attr"; // HTML/Vue template 属性值

/** 分类决定 */
export type Decision = "keep" | "skip" | "review";

/** 从源码提取出的硬编码字符串候选 */
export interface StringCandidate {
  id: string; // 唯一 ID：relFile:start
  file: string; // 绝对路径
  relFile: string; // 相对项目根路径（正斜杠）
  kind: LiteralKind;
  text: string; // 去引号后的文本（模板字符串插值位置以 {var} 占位）
  raw: string; // 源码原文（含引号/模板标记），用于替换
  start: number; // 源码偏移（相对该文件内容）
  end: number;
  line: number; // 1-based 行号
  col: number; // 1-based 列号
  context: string; // 上下文：所在函数/属性名/调用
  placeholders: string[]; // 模板插值变量名
  placeholderExprs?: string[]; // 模板插值表达式源码（替换时原样使用）
  decision?: Decision;
  reason?: string;
  confidence?: number;
  key?: string;
  replacement?: string;
}

/** 单个文件的提取结果 */
export interface ExtractedFile {
  file: string;
  relFile: string;
  candidates: StringCandidate[];
}

/** 资源条目元数据 */
export interface KeyMeta {
  key: string;
  source: string;
  placeholders: string[];
  files: string[];
}

/** 验证问题 */
export interface ValidationIssue {
  level: "error" | "warning";
  category: "key-missing" | "key-extra" | "placeholder" | "syntax" | "untranslated" | "review";
  locale?: string;
  key?: string;
  file?: string;
  message: string;
}

/** 统计摘要 */
export interface Stats {
  filesScanned: number;
  candidates: number;
  keep: number;
  skip: number;
  review: number;
  keysCreated: number;
  replacedFiles: number;
  replacements: number;
  translated: number;
  untranslated: number;
  issues: number;
}

/** LLM 配置 */
export interface LlmConfig {
  provider: "openai" | "mock";
  baseURL?: string;
  apiKey?: string;
  model: string;
  temperature?: number;
  timeoutMs?: number;
}

/** 全局配置 */
export interface I18nAgentConfig {
  project: string;
  src: string[];
  ignore: string[];
  extensions: string[];
  locales: {
    dir: string;
    default: string;
    targets: string[];
  };
  keyStyle: "semantic" | "hash";
  translationFn: string;
  importStatement?: string;
  initStatement?: string;
  autoImport: boolean;
  backup: boolean;
  dryRun: boolean;
  callStyle: "call" | "jsx" | "vue-attr" | "html-text";
  llm?: LlmConfig;
  glossary: string[];
  llmClassify: boolean;
  placeholderSyntax: ("{}" | "{{}}" | "%s" | "${}")[];
  skipPatterns: string[];
  keepPatterns: string[];
  logLevel: "debug" | "info" | "warn" | "error" | "silent";
}