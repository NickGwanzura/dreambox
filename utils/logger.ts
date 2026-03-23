/**
 * Production-safe logging utility
 * Strips debug logs in production builds
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// @ts-ignore
const isDev = import.meta.env?.DEV ?? true;

const isErrorLike = (value: unknown): value is Error => value instanceof Error;

const normalizeValue = (value: unknown): unknown => {
  if (isErrorLike(value)) {
    const error = value as Error & {
      cause?: unknown;
      status?: number;
      code?: string;
      details?: unknown;
    };

    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: error.cause ? normalizeValue(error.cause) : undefined,
      status: error.status,
      code: error.code,
      details: error.details ? normalizeValue(error.details) : undefined,
    };
  }

  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
        key,
        normalizeValue(nestedValue),
      ])
    );
  }

  return value;
};

class Logger {
  private shouldLog(level: LogLevel): boolean {
    if (isDev) return true;
    // In production, only log warnings and errors
    return level === 'warn' || level === 'error';
  }

  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  }

  private normalizeArgs(args: any[]): any[] {
    return args.map(normalizeValue);
  }

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog('debug')) {
      console.debug(this.formatMessage('debug', message), ...this.normalizeArgs(args));
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.shouldLog('info')) {
      console.info(this.formatMessage('info', message), ...this.normalizeArgs(args));
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message), ...this.normalizeArgs(args));
    }
  }

  error(message: string, ...args: any[]): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message), ...this.normalizeArgs(args));
    }
  }

  // Group related logs
  group(label: string): void {
    if (isDev) {
      console.group(label);
    }
  }

  groupEnd(): void {
    if (isDev) {
      console.groupEnd();
    }
  }
}

export const logger = new Logger();
