/**
 * 分级日志工具（支持颜色与级别过滤）
 */
export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 };

export class Logger {
  private level: LogLevel;
  private prefix: string;
  constructor(level: LogLevel = "info", prefix = "[i18n-agent]") {
    this.level = level;
    this.prefix = prefix;
  }
  setLevel(l: LogLevel) {
    this.level = l;
  }
  private emit(l: LogLevel, msg: string) {
    if (LEVELS[l] < LEVELS[this.level]) return;
    const tag = { debug: "DEBUG", info: "INFO ", warn: "WARN ", error: "ERROR", silent: "" }[l];
    const color = { debug: "\x1b[90m", info: "\x1b[36m", warn: "\x1b[33m", error: "\x1b[31m", silent: "" }[l];
    const reset = "\x1b[0m";
    console.log(color + this.prefix + " [" + tag + "]" + reset + " " + msg);
  }
  debug(msg: string) { this.emit("debug", msg); }
  info(msg: string) { this.emit("info", msg); }
  warn(msg: string) { this.emit("warn", msg); }
  error(msg: string) { this.emit("error", msg); }
}

export const logger = new Logger();
