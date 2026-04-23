import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buildClearCookie } from './_auth';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }
  res.setHeader('Set-Cookie', buildClearCookie());
  res.status(200).json({ ok: true });
}
