/**
 * Server-side logger for Railway/Node.js
 * Structured, colorful console output with timestamps and log levels.
 */

// ANSI colors
const C = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  // text
  white:   '\x1b[37m',
  grey:    '\x1b[90m',
  red:     '\x1b[31m',
  yellow:  '\x1b[33m',
  green:   '\x1b[32m',
  cyan:    '\x1b[36m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  // bg
  bgRed:   '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgBlue:  '\x1b[44m',
  bgYellow:'\x1b[43m',
} as const;

const useColor = process.env.NO_COLOR !== '1' && process.stdout.isTTY !== false;
const c = (code: string, text: string) => useColor ? `${code}${text}${C.reset}` : text;

function timestamp(): string {
  return new Date().toISOString();
}

function pad(s: string, len: number): string {
  return s.padEnd(len);
}

// ─── Level labels ─────────────────────────────────────────────────────────────

const LEVEL_LABEL: Record<string, string> = {
  DEBUG: useColor ? c(C.grey,    ' DBG') : ' DBG',
  INFO:  useColor ? c(C.cyan,    'INFO') : 'INFO',
  WARN:  useColor ? c(C.yellow,  'WARN') : 'WARN',
  ERROR: useColor ? c(C.red,     ' ERR') : ' ERR',
  HTTP:  useColor ? c(C.blue,    'HTTP') : 'HTTP',
  DB:    useColor ? c(C.magenta, '  DB') : '  DB',
  BOOT:  useColor ? c(C.green,   'BOOT') : 'BOOT',
};

// Write directly to process streams to avoid any console override loops
function write(level: string, msg: string, ...extras: any[]): void {
  const ts = c(C.grey, timestamp());
  const lbl = LEVEL_LABEL[level] ?? level;
  let line = `${ts}  ${lbl}  ${msg}`;
  if (extras.length > 0) {
    const extStr = extras.map(e => {
      if (typeof e === 'string') return e;
      try { return JSON.stringify(e, null, 2); } catch { return String(e); }
    }).join(' ');
    line += `  ${c(C.grey, extStr)}`;
  }
  const stream = (level === 'ERROR' || level === 'WARN') ? process.stderr : process.stdout;
  stream.write(line + '\n');
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const log = {
  debug: (msg: string, ...args: any[]) => write('DEBUG', msg, ...args),
  info:  (msg: string, ...args: any[]) => write('INFO',  msg, ...args),
  warn:  (msg: string, ...args: any[]) => write('WARN',  msg, ...args),
  error: (msg: string, ...args: any[]) => write('ERROR', msg, ...args),
  http:  (msg: string, ...args: any[]) => write('HTTP',  msg, ...args),
  db:    (msg: string, ...args: any[]) => write('DB',    msg, ...args),
  boot:  (msg: string, ...args: any[]) => write('BOOT',  msg, ...args),
};

// ─── HTTP status coloring ─────────────────────────────────────────────────────

function colorStatus(status: number): string {
  const s = String(status);
  if (status >= 500) return c(C.red + C.bold, s);
  if (status >= 400) return c(C.yellow,        s);
  if (status >= 300) return c(C.cyan,          s);
  if (status >= 200) return c(C.green,         s);
  return s;
}

function colorMethod(method: string): string {
  const m = pad(method, 6);
  switch (method) {
    case 'GET':    return c(C.green,   m);
    case 'POST':   return c(C.blue,    m);
    case 'PUT':    return c(C.yellow,  m);
    case 'PATCH':  return c(C.yellow,  m);
    case 'DELETE': return c(C.red,     m);
    default:       return c(C.grey,    m);
  }
}

// ─── Express middleware ───────────────────────────────────────────────────────

import type { Request, Response, NextFunction } from 'express';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const method = req.method;
  const url = req.originalUrl || req.url;
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    ?? req.socket?.remoteAddress
    ?? '-';

  // Log incoming request
  const authHeader = req.headers['authorization'];
  const hasAuth = authHeader?.startsWith('Bearer ') ? c(C.green, '✓auth') : c(C.grey, '○anon');

  log.http(`→ ${colorMethod(method)} ${c(C.white, url)}  ${hasAuth}  ${c(C.grey, ip)}`);

  // Intercept finish to log response
  res.on('finish', () => {
    const ms = Date.now() - start;
    const status = res.statusCode;
    const msStr = ms > 1000 ? c(C.red,    `${ms}ms`)
                : ms > 300  ? c(C.yellow, `${ms}ms`)
                :              c(C.grey,  `${ms}ms`);

    const icon = status >= 400 ? '✗' : '✓';
    log.http(`${icon} ${colorMethod(method)} ${c(C.white, url)}  ${colorStatus(status)}  ${msStr}`);
  });

  next();
}

// ─── Startup environment report ───────────────────────────────────────────────

export function logStartupInfo(port: number | string): void {
  const env = process.env.NODE_ENV || 'development';
  const line = '─'.repeat(60);

  log.boot(line);
  log.boot(`  ${c(C.bold + C.green, 'Dreambox Billboard Suite')}  ${c(C.grey, `v${getVersion()}`)}`);
  log.boot(line);

  log.boot(`  Env        : ${c(C.cyan, env)}`);
  log.boot(`  Port       : ${c(C.cyan, String(port))}`);
  log.boot(`  Node       : ${c(C.grey, process.version)}`);
  log.boot(`  PID        : ${c(C.grey, String(process.pid))}`);

  // Check env vars without leaking secrets
  const vars: Record<string, string | undefined> = {
    DATABASE_URL:  process.env.DATABASE_URL,
    JWT_SECRET:    process.env.JWT_SECRET,
    RESEND_API_KEY:process.env.RESEND_API_KEY,
    GROQ_API_KEY:  process.env.GROQ_API_KEY,
    APP_URL:       process.env.APP_URL,
  };

  log.boot(line);
  log.boot('  Environment variables:');
  for (const [key, val] of Object.entries(vars)) {
    if (val) {
      const preview = key.includes('URL') || key === 'APP_URL'
        ? c(C.grey, val.replace(/:[^:@]*@/, ':***@'))   // mask password in URL
        : c(C.grey, `${val.slice(0, 6)}…`);             // mask secret
      log.boot(`    ${c(C.green, '✓')} ${pad(key, 20)} ${preview}`);
    } else {
      log.boot(`    ${c(C.red, '✗')} ${pad(key, 20)} ${c(C.red, 'MISSING')}`);
    }
  }

  log.boot(line);
}

function getVersion(): string {
  return process.env.npm_package_version ?? '1.0.0';
}

// ─── Error handler middleware ─────────────────────────────────────────────────

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  log.error(`Unhandled error on ${req.method} ${req.originalUrl}`, {
    message: err?.message,
    stack:   err?.stack,
    code:    err?.code,
  });
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

// ─── DB operation helpers ─────────────────────────────────────────────────────

export function dbQuery(table: string, op: string, detail?: string): void {
  log.db(`${c(C.bold, op)} ${c(C.cyan, table)}${detail ? c(C.grey, '  ' + detail) : ''}`);
}

export function dbError(table: string, op: string, err: any): void {
  log.error(`DB ${op} on ${table} failed: ${err?.message ?? err}`, {
    code:    err?.code,
    meta:    err?.meta,
  });
}
