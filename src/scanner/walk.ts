/**
 * 文件遍历：按扩展名收集项目源码文件，应用忽略规则（glob）。
 */
import * as fs from 'fs';
import * as path from 'path';

/**
 * glob 匹配（支持 **、*、?）：把 glob 转为正则，对相对路径（正斜杠）匹配。
 * 行为：pattern 以 / 结尾或包含 / 时按路径段匹配；否则匹配任意层级。
 */
export function globToRegExp(glob: string): RegExp {
  let re = '';
  let i = 0;
  const s = glob;
  while (i < s.length) {
    const c = s[i];
    if (c === '*') {
      if (s[i + 1] === '*') {
        if (s[i + 2] === '/') { re += '(?:.*/)?'; i += 3; continue; }
        re += '.*'; i += 2; continue;
      }
      re += '[^/]*'; i += 1; continue;
    }
    if (c === '?') { re += '[^/]'; i += 1; continue; }
    if (c === '.') { re += '\\.'; i += 1; continue; }
    if (c === '/') { re += '/'; i += 1; continue; }
    if ('+()|^$@%{}[]'.includes(c)) { re += '\\' + c; i += 1; continue; }
    re += c;
    i += 1;
  }
  return new RegExp('^' + re + '$');
}

export interface WalkOptions {
  extensions: string[];
  ignore: string[];
  src: string[];
}

/** 收集项目内所有需要扫描的源码文件（返回正斜杠相对路径列表） */
export function walkSourceFiles(rootDir: string, opts: WalkOptions): string[] {
  const ignoreRes = opts.ignore.map((g) => globToRegExp(g));
  const extSet = new Set(opts.extensions.map((e) => (e.startsWith('.') ? e : '.' + e).toLowerCase()));
  const out: string[] = [];

  function isIgnored(rel: string, isDir: boolean): boolean {
    const p = rel.replace(/\\/g, '/');
    for (const re of ignoreRes) {
      if (re.test(p)) return true;
      // 目录：若目录名匹配 ignore，则其下全部忽略
      if (isDir) {
        const seg = p.split('/').pop() || '';
        const segRe = new RegExp(re.source.replace(/\^|\$/g, ''));
        if (segRe.test(seg)) return true;
      }
    }
    return false;
  }

  function walk(dir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const ent of entries) {
      const abs = path.join(dir, ent.name);
      const rel = path.relative(rootDir, abs).replace(/\\/g, '/');
      if (ent.isDirectory()) {
        if (isIgnored(rel, true)) continue;
        walk(abs);
      } else if (ent.isFile()) {
        if (isIgnored(rel, false)) continue;
        const ext = path.extname(ent.name).toLowerCase();
        if (extSet.has(ext)) out.push(rel);
      }
    }
  }

  const srcDirs = opts.src && opts.src.length > 0 ? opts.src : ['.'];
  for (const sub of srcDirs) {
    const abs = path.isAbsolute(sub) ? sub : path.join(rootDir, sub);
    walk(abs);
  }
  return out;
}

/** 读取文件文本 */
export function readText(absPath: string): string {
  return fs.readFileSync(absPath, 'utf8');
}

/** 文件相对项目根的规范化路径（正斜杠） */
export function relPath(rootDir: string, absPath: string): string {
  return path.relative(rootDir, absPath).replace(/\\/g, '/');
}
