import crypto from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// 쿠키 이름 및 토큰 유효기간(초)
export const COOKIE_NAME = 'ot_session';
export const DEFAULT_TTL_SECONDS = 60 * 60 * 8; // 8시간

/**
 * 환경변수에서 인증 시크릿을 얻는다.
 * 없으면 예외를 던져 호출자에서 500으로 처리.
 */
export function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('AUTH_SECRET 환경변수가 설정되지 않았거나 너무 짧습니다 (16자 이상 권장).');
  }
  return secret;
}

/**
 * 로그인 비밀번호 환경변수. 기본값은 로컬 개발 편의용.
 */
export function getLoginPassword(): string {
  return process.env.LOGIN_PASSWORD || 'cosmax-dev';
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sign(payload: string, secret: string): string {
  const mac = crypto.createHmac('sha256', secret).update(payload).digest();
  return base64UrlEncode(mac);
}

/**
 * 토큰 생성: `{exp}.{sig}` 형식
 * exp: 만료 시각 (Unix epoch seconds)
 * sig: HMAC-SHA256(exp, secret) base64url
 */
export function createToken(ttlSeconds: number = DEFAULT_TTL_SECONDS): string {
  const secret = getAuthSecret();
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = sign(String(exp), secret);
  return `${exp}.${sig}`;
}

/**
 * 토큰 검증. 유효하면 true 반환.
 * 타이밍 공격 방지를 위해 timingSafeEqual 사용.
 */
export function verifyToken(token: string | undefined | null): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [expStr, providedSig] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp)) return false;
  if (Math.floor(Date.now() / 1000) >= exp) return false;

  let secret: string;
  try {
    secret = getAuthSecret();
  } catch {
    return false;
  }

  const expectedSig = sign(expStr, secret);
  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * 요청 쿠키에서 세션 토큰 추출.
 */
export function readCookie(req: VercelRequest, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  const pairs = header.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    if (key === name) {
      const value = pair.slice(idx + 1).trim();
      return decodeURIComponent(value);
    }
  }
  return undefined;
}

/**
 * 세션 쿠키 Set-Cookie 헤더 값 생성.
 */
export function buildSessionCookie(token: string, ttlSeconds: number = DEFAULT_TTL_SECONDS): string {
  const isProd = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${ttlSeconds}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (isProd) parts.push('Secure');
  return parts.join('; ');
}

/**
 * 쿠키 즉시 만료 헤더 값.
 */
export function buildClearCookie(): string {
  const isProd = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
  const parts = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (isProd) parts.push('Secure');
  return parts.join('; ');
}

/**
 * 요청이 인증된 세션인지 검사.
 */
export function isAuthenticated(req: VercelRequest): boolean {
  const token = readCookie(req, COOKIE_NAME);
  return verifyToken(token);
}

/**
 * 인증 실패 시 401 응답. 호출 측에서 return.
 */
export function respondUnauthorized(res: VercelResponse): void {
  res.status(401).json({ ok: false, error: 'unauthorized' });
}
