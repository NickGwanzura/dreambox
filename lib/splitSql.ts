/**
 * Split a raw SQL script into individual statements for execution one at a
 * time. Prisma's extended query protocol rejects multi-statement strings, so a
 * whole migration file must be split before it can be replayed through
 * `$executeRawUnsafe`.
 *
 * The lexer understands:
 *   - dollar-quoted bodies (`$$ ... $$` and `$tag$ ... $tag$`) — function
 *     bodies contain semicolons and comments that must NOT split or be stripped
 *   - single-quoted strings with `''` escapes
 *   - `--` line comments and `/* ... *​/` block comments
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let buf = '';
  let i = 0;
  const n = sql.length;

  while (i < n) {
    const c = sql[i];

    // -- line comment: skip to end of line (only meaningful outside dollar quotes)
    if (c === '-' && sql[i + 1] === '-') {
      while (i < n && sql[i] !== '\n') i++;
      continue;
    }

    // /* ... */ block comment
    if (c === '/' && sql[i + 1] === '*') {
      i += 2;
      while (i < n && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i = Math.min(i + 2, n);
      continue;
    }

    // Single-quoted string (' ' is the SQL escape for a quote)
    if (c === "'") {
      buf += c;
      i++;
      while (i < n) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            buf += "''";
            i += 2;
            continue;
          }
          buf += "'";
          i++;
          break;
        }
        buf += sql[i];
        i++;
      }
      continue;
    }

    // Dollar-quoted string: $$ or $tag$
    if (c === '$') {
      const m = sql.slice(i).match(/^\$\$|^\$[A-Za-z_][A-Za-z0-9_]*\$/);
      if (m) {
        const tag = m[0];
        const close = sql.indexOf(tag, i + tag.length);
        if (close === -1) {
          buf += sql.slice(i);
          break;
        }
        buf += sql.slice(i, close + tag.length);
        i = close + tag.length;
        continue;
      }
    }

    // Statement terminator
    if (c === ';') {
      const stmt = buf.trim();
      if (stmt) statements.push(stmt);
      buf = '';
      i++;
      continue;
    }

    buf += c;
    i++;
  }

  const tail = buf.trim();
  if (tail) statements.push(tail);
  return statements;
}
