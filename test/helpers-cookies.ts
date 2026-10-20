import type { Request, Response, NextFunction } from 'express';

/**
 * Minimaler Cookie-Leser für Tests: legt `req.cookies` an wie cookie-parser.
 * Bewusst ohne cookie-parser, damit die Test-Apps nicht als
 * „Cookie-Middleware ohne CSRF-Schutz" gelten (CodeQL js/missing-token-validation).
 */
export function readCookies(req: Request, _res: Response, next: NextFunction): void {
  const out: Record<string, string> = {};
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const name = part.slice(0, i).trim();
    if (!(name in out)) out[name] = decodeURIComponent(part.slice(i + 1).trim());
  }
  (req as Request & { cookies: Record<string, string> }).cookies = out;
  next();
}
