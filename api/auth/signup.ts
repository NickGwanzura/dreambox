import type { HttpRequest, HttpResponse } from '../../lib/http';
import { cors } from '../../lib/auth';

export default async function handler(req: HttpRequest, res: HttpResponse) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  return res.status(403).json({
    error: 'Public account registration is disabled. Please contact a Dreambox administrator for access.',
  });
}
