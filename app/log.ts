import * as fs from "fs";
import * as yaml from "js-yaml";

export interface LogEntry {
  id: number;
  timestamp: string;
  level: string;
  message: string;
  filename: string;
  func: string;
  line: number;
}

const MAX_BUFFER_SIZE = 2000;

type LogSubscriber = (entry: LogEntry) => void;

class Logger {
  private readonly RESET = "\x1b[0m";
  private readonly GREEN = "\x1b[32m";
  private readonly YELLOW = "\x1b[33m";
  private readonly LEVEL_WEIGHT: Record<string, number> = {
    TRACE: 0,
    DEBUG: 10,
    INFO: 20,
    SUCCESS: 20,
    WARN: 30,
    ERROR: 40,
  };
  private readonly LEVEL_COLORS: Record<string, string> = {
    TRACE: "\x1b[90m",
    INFO: "\x1b[37m",
    WARN: "\x1b[33m",
    ERROR: "\x1b[31m",
    SUCCESS: "\x1b[92m",
    DEBUG: "\x1b[36m",
  };
  private configuredLevel: string | null = null;
  private buffer: LogEntry[] = [];
  private nextId = 1;
  private subscribers = new Set<LogSubscriber>();

  private getCallerInfo() {
    try {
      const err = new Error();
      const stack = err.stack?.split("\n") || [];
      const callerLine = stack[4] || "";
      const match = callerLine.match(
        /at (?:(.+?)\s)?.*?\(?(.+?):(\d+):(\d+)\)?$/,
      );
      if (match) {
        const func = match[1] || "anonymous";
        const filename = match[2].split("/").pop() || "unknown";
        const line = parseInt(match[3], 10) || 0;
        return { filename, func, line };
      }
    } catch (e) {}
    return { filename: "unknown", func: "unknown", line: 0 };
  }

  private getLevel(): string {
    const level =
      process.env.LOG_LEVEL?.toUpperCase() || this.getConfiguredLevel();
    return this.LEVEL_WEIGHT[level] === undefined ? "INFO" : level;
  }

  private getConfiguredLevel(): string {
    if (this.configuredLevel !== null) return this.configuredLevel;

    try {
      const configFile = "./config/config.yml";
      if (!fs.existsSync(configFile)) {
        this.configuredLevel = "INFO";
        return this.configuredLevel;
      }

      const config = yaml.load(fs.readFileSync(configFile, "utf8")) as any;
      this.configuredLevel = String(config?.log?.level || "INFO").toUpperCase();
    } catch (e) {
      this.configuredLevel = "INFO";
    }

    return this.configuredLevel;
  }

  private shouldLog(level: string): boolean {
    return this.LEVEL_WEIGHT[level] >= this.LEVEL_WEIGHT[this.getLevel()];
  }

  private log(level: string, message: string) {
    if (!this.shouldLog(level)) return;

    const now = new Date()
      .toISOString()
      .replace("T", " ")
      .replace(/\.\d+Z$/, "");
    const caller = this.getCallerInfo();

    const entry: LogEntry = {
      id: this.nextId++,
      timestamp: now,
      level,
      message,
      filename: caller.filename,
      func: caller.func,
      line: caller.line,
    };

    this.buffer.push(entry);
    if (this.buffer.length > MAX_BUFFER_SIZE) {
      this.buffer.splice(0, this.buffer.length - MAX_BUFFER_SIZE);
    }

    const subscribers = [...this.subscribers];
    for (const subscriber of subscribers) {
      try {
        subscriber(entry);
      } catch {}
    }

    const levelColor = this.LEVEL_COLORS[level] || this.RESET;
    console.log(
      `${this.GREEN}[${now}]${this.RESET} ` +
        `${levelColor}[${level}]${this.RESET} ` +
        `${this.YELLOW}[${caller.filename}:${caller.func}:${caller.line}]${this.RESET}: ` +
        `${levelColor}${message}${this.RESET}`,
    );
  }

  public info(message: string) {
    this.log("INFO", message);
  }

  public warn(message: string) {
    this.log("WARN", message);
  }

  public error(message: string) {
    this.log("ERROR", message);
  }

  public success(message: string) {
    this.log("SUCCESS", message);
  }

  public debug(message: string) {
    this.log("DEBUG", message);
  }

  public trace(message: string) {
    this.log("TRACE", message);
  }

  public subscribe(fn: LogSubscriber): void {
    this.subscribers.add(fn);
  }

  public unsubscribe(fn: LogSubscriber): void {
    this.subscribers.delete(fn);
  }

  public getBuffer(): LogEntry[] {
    return [...this.buffer];
  }

  public getBufferAfter(
    afterId: number,
    level?: string,
    search?: string,
  ): LogEntry[] {
    let entries = this.buffer;
    if (afterId > 0) {
      const startIdx = entries.findIndex((e) => e.id > afterId);
      if (startIdx === -1) return [];
      entries = entries.slice(startIdx);
    }
    if (level && level !== "ALL") {
      entries = entries.filter((e) => e.level === level);
    }
    if (search) {
      const lower = search.toLowerCase();
      entries = entries.filter(
        (e) =>
          e.message.toLowerCase().includes(lower) ||
          e.filename.toLowerCase().includes(lower) ||
          e.func.toLowerCase().includes(lower),
      );
    }
    return entries;
  }
}

const logger = new Logger();
export default logger;

export function subscribeToLogs(fn: LogSubscriber): void {
  logger.subscribe(fn);
}

export function unsubscribeFromLogs(fn: LogSubscriber): void {
  logger.unsubscribe(fn);
}

export function getLogBuffer(): LogEntry[] {
  return logger.getBuffer();
}

export function getLogBufferAfter(
  afterId: number,
  level?: string,
  search?: string,
): LogEntry[] {
  return logger.getBufferAfter(afterId, level, search);
}
