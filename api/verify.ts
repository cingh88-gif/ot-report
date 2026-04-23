import type { VercelRequest, VercelResponse } from '@vercel/node';
import { isAuthenticated } from './_auth';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }
  // 캐시 방지: 인증 상태는 항상 실시간 검증
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ ok: isAuthenticated(req) });
}
