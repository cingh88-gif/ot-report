import React, { useEffect, useState, useCallback } from 'react';

type AuthStatus = 'checking' | 'unauthenticated' | 'authenticated';

interface AuthGateProps {
  children: React.ReactNode;
}

/**
 * 로그인 게이트 컴포넌트
 * - 마운트 시 /api/verify 호출하여 세션 검증
 * - 미인증: 비밀번호 입력 폼 노출
 * - 인증: children 렌더 + 우측 상단 로그아웃 버튼
 */
export default function AuthGate({ children }: AuthGateProps) {
  const [status, setStatus] = useState<AuthStatus>('checking');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 초기 세션 검증
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/verify', { credentials: 'same-origin', cache: 'no-store' });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
        if (cancelled) return;
        setStatus(data.ok ? 'authenticated' : 'unauthenticated');
      } catch (err) {
        if (cancelled) return;
        console.error('[AuthGate] verify error:', err);
        setStatus('unauthenticated');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (submitting) return;
      setSubmitting(true);
      setError(null);
      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ password }),
        });
        if (res.ok) {
          setPassword('');
          setStatus('authenticated');
          return;
        }
        if (res.status === 401) {
          setError('비밀번호가 올바르지 않습니다.');
        } else if (res.status === 500) {
          setError('서버 구성 오류입니다. 관리자에게 문의하세요.');
        } else {
          setError('로그인에 실패했습니다.');
        }
      } catch (err) {
        console.error('[AuthGate] login error:', err);
        setError('네트워크 오류가 발생했습니다.');
      } finally {
        setSubmitting(false);
      }
    },
    [password, submitting],
  );

  const handleLogout = useCallback(async () => {
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
    } catch (err) {
      console.error('[AuthGate] logout error:', err);
    } finally {
      window.location.reload();
    }
  }, []);

  if (status === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500 text-sm">
        세션 확인 중...
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-sm bg-white rounded-xl shadow-md border border-gray-200 p-8"
        >
          <h1 className="text-xl font-semibold text-gray-900 mb-1">생산팀 OT 주간 보고</h1>
          <p className="text-sm text-gray-500 mb-6">열람하려면 비밀번호를 입력하세요.</p>
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="pw">
            비밀번호
          </label>
          <input
            id="pw"
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
            disabled={submitting}
          />
          {error && (
            <p className="mt-3 text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting || password.length === 0}
            className="mt-5 w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium py-2 rounded-md transition-colors"
          >
            {submitting ? '확인 중...' : '로그인'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <>
      {children}
      <button
        type="button"
        onClick={handleLogout}
        className="fixed bottom-4 right-4 z-50 bg-white/90 hover:bg-white border border-gray-300 text-gray-700 hover:text-gray-900 text-xs font-medium px-3 py-1.5 rounded-md shadow-sm backdrop-blur"
        aria-label="로그아웃"
      >
        로그아웃
      </button>
    </>
  );
}
