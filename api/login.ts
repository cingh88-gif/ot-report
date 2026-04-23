import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  buildSessionCookie,
  createToken,
  DEFAULT_TTL_SECONDS,
  getLoginPassword,
} from './_auth';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  // body 파싱: Vercel Node 런타임은 JSON을 자동 파싱하지만 안전하게 처리
  let body: unknown = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      res.status(400).json({ ok: false, error: 'invalid_json' });
      return;
    }
  }

  const password =
    body && typeof body === 'object' && 'password' in body
      ? (body as { password?: unknown }).password
      : undefined;

  if (typeof password !== 'string' || password.length === 0) {
    res.status(400).json({ ok: false, error: 'password_required' });
    return;
  }

  let expected: string;
  try {
    expected = getLoginPassword();
  } catch (err) {
    console.error('[api/login] config error', err);
    res.status(500).json({ ok: false, error: 'server_misconfigured' });
    return;
  }

  // 비밀번호 비교 (짧고 단순하므로 기본 비교 사용)
  if (password !== expected) {
    res.status(401).json({ ok: false, error: 'invalid_password' });
    return;
  }

  let token: string;
  try {
    token = createToken(DEFAULT_TTL_SECONDS);
  } catch (err) {
    console.error('[api/login] secret error', err);
    res.status(500).json({ ok: false, error: 'server_misconfigured' });
    return;
  }

  res.setHeader('Set-Cookie', buildSessionCookie(token, DEFAULT_TTL_SECONDS));
  res.status(200).json({ ok: true });
}
