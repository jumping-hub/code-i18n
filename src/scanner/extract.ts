/**
 * TS/JS/JSX 硬编码字符串提取器（基于 TypeScript Compiler API）。
 * 提取所有 StringLiteral / 模板字符串 / JSX 文本，附带上下文信息，
 * 供分类器判断是否为用户可见文本。
 */
import * as ts from 'typescript';
import { StringCandidate, LiteralKind } from '../types';

export interface ExtractTsOptions {
  /** 排除这些调用名的字符串（如日志），为空则不过滤 */
  excludeCalls?: string[];
}

/** 判断字符串是否属于非 UI 语法位置（import/类型/key 等），直接排除 */
function isSyntaxNonUi(node: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral | ts.TemplateExpression): boolean {
  const p = node.parent;
  if (!p) return false;
  if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isImportEqualsDeclaration(p)) return true;
  if (ts.isImportClause(p) || ts.isNamedImports(p) || ts.isImportSpecifier(p) || ts.isExportSpecifier(p)) return true;
  if (ts.isCallExpression(p)) {
    const callee = p.expression.getText(p.getSourceFile()).trim();
    if (callee === 'require' && p.arguments[0] === node) return true;
    if (callee === 'import') return true;
  }
  // 对象字面量作为 key 的字符串
  if (ts.isPropertyAssignment(p) && p.name === node) return true;
  if (ts.isPropertySignature(p) && p.name === node) return true;
  if (ts.isLiteralTypeNode(p)) return true;
  if (ts.isEnumMember(p) && p.name === node) return true;
  if (ts.isTypeReferenceNode(p) || ts.isExpressionWithTypeArguments(p)) return true;
  if (ts.isJsxOpeningElement(p) || ts.isJsxClosingElement(p) || ts.isJsxSelfClosingElement(p)) return true;
  if (ts.isJsxAttribute(p) && p.initializer === node) return true; // 由 JSX 专用逻辑处理
  if (ts.isMetaProperty(p)) return true;


  // 文件级 directive（'use strict'）
  if (ts.isExpressionStatement(p)) {
    const sf = p.getSourceFile();
    const first = sf.statements[0];
    if (first === p && ts.isStringLiteral((p as ts.ExpressionStatement).expression)) return true;
  }
  // 修饰符/装饰器参数等
  if (ts.isDecorator(p)) return true;
  return false;
}

/** 判断字符串是否为翻译函数调用的 key 参数（t('key')、$t('key')、i18n.t('key') 等），这些应跳过 */
export function isTranslationCallArg(node: ts.Node): boolean {
  const p = node.parent;
  if (!p || !ts.isCallExpression(p)) return false;
  if (p.arguments.length === 0 || p.arguments[0] !== node) return false;
  const callee = p.expression.getText(p.getSourceFile()).trim();
  if (/(^|[\.(])(\$?t|translate|formatMessage|_)\s*\(?$/.test(callee)) return true;
  if (/\.(t|translate|formatMessage)\s*\(?$/.test(callee)) return true;
  return false;
}

/** 查找最近的上下文（调用/属性/变量/返回值等） */
function findContext(node: ts.Node, sf: ts.SourceFile): string {
  let cur = node.parent;
  while (cur) {
    if (ts.isCallExpression(cur)) {
      const callee = cur.expression.getText(sf).replace(/\n/g, ' ').slice(0, 60);
      const idx = cur.arguments.indexOf(node as ts.Expression);
      return 'call: ' + callee + (idx >= 0 ? ' [arg ' + idx + ']' : '');
    }
    if (ts.isNewExpression(cur)) {
      return 'new: ' + cur.expression.getText(sf).slice(0, 40);
    }
    if (ts.isPropertyAssignment(cur)) {
      const nm = cur.name.getText(sf);
      if (cur.name !== node) return 'prop: ' + nm;
    }
    if (ts.isPropertyDeclaration(cur)) {
      const nm = cur.name.getText(sf);
      if (cur.name !== node) return 'class-prop: ' + nm;
    }
    if (ts.isVariableDeclaration(cur)) {
      if (ts.isIdentifier(cur.name)) return 'var: ' + cur.name.text;
    }
    if (ts.isParameter(cur)) {
      if (ts.isIdentifier(cur.name)) return 'param: ' + cur.name.text;
    }
    if (ts.isJsxAttribute(cur)) return 'jsx-attr: ' + cur.name.getText(sf);
    if (ts.isReturnStatement(cur)) return 'return';
    if (ts.isThrowStatement(cur)) return 'throw';
    if (ts.isBinaryExpression(cur) && cur.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      let up = cur.parent;
      while (up) {
        if (ts.isCallExpression(up)) return 'concat @ ' + up.expression.getText(sf).replace(/\n/g, ' ').slice(0, 50);
        up = up.parent;
      }
      return 'concat';
    }
    cur = cur.parent;
  }
  return '';
}

/**
 * 提取模板字符串：拆出文本（插值处 {name}）与插值信息。
 */
function extractTemplate(node: ts.TemplateExpression, sf: ts.SourceFile): { text: string; placeholders: string[]; exprs: string[] } {
  let text = node.head.text;
  const placeholders: string[] = [];
  const exprs: string[] = [];
  for (const span of node.templateSpans) {
    const expr = span.expression;
    const exprText = expr.getText(sf).trim();
    const name = placeholderName(expr, exprText, placeholders.length);
    text += '{' + name + '}';
    placeholders.push(name);
    exprs.push(exprText);
    text += span.literal.text;
  }
  return { text, placeholders, exprs };
}

/** 从表达式推导占位符名：标识符/成员访问取最后一段，否则 v0/v1... */
export function placeholderName(expr: ts.Expression, exprText: string, index: number): string {
  let name = exprText;
  if (ts.isIdentifier(expr)) name = expr.text;
  else if (ts.isPropertyAccessExpression(expr)) name = expr.name.text;
  else if (ts.isElementAccessExpression(expr)) name = expr.argumentExpression.getText(expr.getSourceFile()).replace(/['"]/g, '');
  name = name.replace(/[^\w$]/g, '_');
  if (!name || /^\d/.test(name)) name = 'v' + index;
  return name;
}

/**
 * 从 TS/JS/JSX 源码提取字符串候选。
 * @param absFile 绝对路径（仅用于定位与解析）
 * @param relFile 相对项目路径
 * @param source 源码文本
 * @param scriptKind 脚本种类（TS/TSX/JS/JSX）
 */
export function extractTsCandidates(
  absFile: string,
  relFile: string,
  source: string,
  scriptKind: ts.ScriptKind
): StringCandidate[] {
  const sf = ts.createSourceFile(absFile, source, ts.ScriptTarget.Latest, true, scriptKind);
  const out: StringCandidate[] = [];

  const add = (node: ts.Node, kind: LiteralKind, text: string, placeholders: string[], exprs: string[] | undefined, raw: string, start: number, end: number, context: string) => {
    const pos = sf.getLineAndCharacterOfPosition(start);
    const base = {
      id: relFile + ':' + start,
      file: absFile,
      relFile,
      kind,
      text,
      raw,
      start,
      end,
      line: pos.line + 1,
      col: pos.character + 1,
      context,
      placeholders,
    };
    if (exprs) (base as { placeholderExprs?: string[] }).placeholderExprs = exprs;
    out.push(base as StringCandidate);
  };

  function visit(node: ts.Node) {
    if (ts.isStringLiteral(node)) {
      if (!isSyntaxNonUi(node) && !isTranslationCallArg(node)) {
        const text = node.text;
        const context = findContext(node, sf);
        add(node, 'string', text, [], undefined, "'" + text + "'", node.getStart(sf), node.getEnd(), context);
      }
    } else if (ts.isNoSubstitutionTemplateLiteral(node)) {
      if (!isSyntaxNonUi(node) && !isTranslationCallArg(node)) {
        const text = node.text;
        const context = findContext(node, sf);
        add(node, 'template', text, [], undefined, '`' + text + '`', node.getStart(sf), node.getEnd(), context);
      }
    } else if (ts.isTemplateExpression(node)) {
      if (isTranslationCallArg(node)) { ts.forEachChild(node, visit); return; }
      const { text, placeholders, exprs } = extractTemplate(node, sf);
      const context = findContext(node, sf);
      add(node, 'template', text, placeholders, exprs, node.getText(sf), node.getStart(sf), node.getEnd(), context);
    } else if (ts.isJsxText(node)) {
      const text = node.text;
      if (text.trim().length > 0) {
        const context = 'jsx-text';
        add(node, 'jsx-text', text.trim(), [], undefined, text.trim(), node.getStart(sf) + text.indexOf(text.trim()), node.getStart(sf) + text.indexOf(text.trim()) + text.trim().length, context);
      }
    } else if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
      const lit = node.initializer;
      const text = lit.text;
      const context = 'jsx-attr: ' + node.name.getText(sf);
      add(node, 'jsx-attr', text, [], undefined, '"' + text + '"', lit.getStart(sf), lit.getEnd(), context);
    }
    ts.forEachChild(node, visit);
  }

  visit(sf);
  return out;
}

/** 根据扩展名推断 ScriptKind */
export function scriptKindFor(ext: string): ts.ScriptKind {
  switch (ext.toLowerCase()) {
    case '.tsx': return ts.ScriptKind.TSX;
    case '.jsx': return ts.ScriptKind.JSX;
    case '.js': return ts.ScriptKind.JS;
    case '.mjs': case '.cjs': return ts.ScriptKind.JS;
    default: return ts.ScriptKind.TS;
  }
}