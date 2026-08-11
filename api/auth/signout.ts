import type { HttpRequest, HttpResponse } from '../../lib/http';
import { clearSessionCookie, cors } from '../../lib/auth';

/** Clear the HttpOnly session cookie. Authorization-header clients can still
 * clear their local token independently. */
export default async function handler(req: HttpRequest, res: HttpResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  clearSessionCookie(res);
  return res.status(200).json({ success: true });
}
