import fs from 'node:fs';
import path from 'node:path';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { isAuthenticated, respondUnauthorized } from './_auth';

// 서버리스 cold start 시점에 한 번만 읽도록 캐싱
let cachedCsv: string | null = null;

function loadCsv(): string {
  if (cachedCsv !== null) return cachedCsv;
  // process.cwd()는 Vercel 함수에서 프로젝트 루트를 가리킴
  const candidates = [
    path.join(process.cwd(), 'data', 'data.csv'),
    path.join(__dirname, '..', 'data', 'data.csv'),
  ];
  let lastErr: unknown = null;
  for (const p of candidates) {
    try {
      const content = fs.readFileSync(p, 'utf-8');
      cachedCsv = content;
      return content;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('data.csv not found');
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  if (!isAuthenticated(req)) {
    respondUnauthorized(res);
    return;
  }

  let csv: string;
  try {
    csv = loadCsv();
  } catch (err) {
    console.error('[api/data] read error', err);
    res.status(500).json({ ok: false, error: 'data_read_failed' });
    return;
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  // 인증된 사용자 전용, 공용 캐시 금지
  res.setHeader('Cache-Control', 'private, no-store');
  res.status(200).send(csv);
}

export const config = {
  // Vercel이 data/data.csv 를 번들에 포함하도록 지정
  includeFiles: 'data/**',
};
