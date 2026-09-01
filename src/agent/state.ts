/**
 * 智能体增量状态：记录每个文件的处理进度与 mtime，支持断点恢复。
 */
import * as fs from 'fs';
import * as path from 'path';

export interface FileState {
  mtime: number;
  size: number;
  phase: 'scanned' | 'classified' | 'extracted' | 'replaced' | 'verified';
  keepCount: number;
  replacedCount: number;
}

export interface AgentState {
  version: 1;
  project: string;
  files: Record<string, FileState>;
  updatedAt: string;
}

export function statePath(projectRoot: string): string {
  return path.join(projectRoot, '.i18n-agent', 'state.json');
}

export function loadState(projectRoot: string): AgentState {
  const p = statePath(projectRoot);
  if (!fs.existsSync(p)) return { version: 1, project: projectRoot, files: {}, updatedAt: new Date().toISOString() };
  try {
    const s = JSON.parse(fs.readFileSync(p, 'utf8')) as AgentState;
    if (s.version !== 1 || !s.files) return { version: 1, project: projectRoot, files: {}, updatedAt: new Date().toISOString() };
    return s;
  } catch {
    return { version: 1, project: projectRoot, files: {}, updatedAt: new Date().toISOString() };
  }
}

export function saveState(projectRoot: string, state: AgentState): void {
  const p = statePath(projectRoot);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(p, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

/** 文件 mtime + size 指纹 */
export function fileFingerprint(absPath: string): { mtime: number; size: number } | null {
  try {
    const st = fs.statSync(absPath);
    return { mtime: st.mtimeMs, size: st.size };
  } catch {
    return null;
  }
}

/** 判断文件是否需要重新处理（resume 模式：mtime/size 未变且已到达目标阶段则跳过） */
export function needsReprocess(
  state: AgentState,
  relFile: string,
  absPath: string,
  targetPhase: FileState['phase']
): boolean {
  const cur = state.files[relFile];
  const fp = fileFingerprint(absPath);
  if (!cur || !fp) return true;
  const phaseRank: Record<FileState['phase'], number> = { scanned: 0, classified: 1, extracted: 2, replaced: 3, verified: 4 };
  if (phaseRank[cur.phase] < phaseRank[targetPhase]) return true;
  if (cur.mtime !== fp.mtime || cur.size !== fp.size) return true;
  return false;
}
