/**
 * Production-safe logging utility
 * Strips debug logs in production builds
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// @ts-ignore
const isDev = import.meta.env?.DEV ?? true;

class Logger {
  private shouldLog(level: LogLevel): boolean {
    if (isDev) return true;
    // In production, only log warnings and errors
    return level === 'warn' || level === 'error';
  }

  private formatMessage(level: LogLevel, message: string, ...args: any[]): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  }

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog('debug')) {
      console.debug(this.formatMessage('debug', message), ...args);
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.shouldLog('info')) {
      console.info(this.formatMessage('info', message), ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message), ...args);
    }
  }

  error(message: string, ...args: any[]): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message), ...args);
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
