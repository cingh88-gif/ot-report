# 이관 체크리스트

## 인수자에게 전달할 것

1. **이 git 저장소 주소**
   - 인수자: `git clone <repo-url>` → `npm install` → `npm run dev`
2. **`data.csv` 파일 (1개)**
   - 현재 `public/data.csv`에 있는 실 운영 데이터
   - git에서 제외되어 있으므로 이메일/USB/사내 드라이브로 별도 전달
   - 인수자는 받은 파일을 `public/data.csv` 경로에 그대로 저장

`data.csv`가 없어도 앱은 `public/data.sample.csv`로 폴백되어 정상 실행됩니다 (화면 상단에 안내 메시지).

## 인수자 환경 가정

- Node.js 20 이상 (LTS) 사전 설치
- npm 사용

## 첫 실행 절차

```bash
git clone <repo-url>
cd ot-report
# (선택) 전달받은 실 데이터 파일을 public/data.csv 로 복사
npm install
npm run dev
```

## CSV 데이터 수정 시

- 형식은 `README.md`의 "CSV 스키마" 참고
- 천 단위 콤마(`1,234.5`)는 자동 처리
- `주차` 컬럼:
  - `0` = 해당 월 전체 집계
  - `1`~`5` = 그 월의 N주차 데이터 (있으면 주차별 집계, 없으면 월간만 사용)

## 코드 상 주의 지점

- 폴백 데이터: 별도 하드코딩 상수는 없습니다. `public/data.sample.csv`가 폴백 역할을 합니다. 폴백 화면을 바꾸고 싶으면 이 파일만 수정하세요.
- 팀/파트명 매핑: `src/types.ts`의 `TEAM_NAMES`, `PART_NAMES`. 신규 팀/파트 추가 시 여기와 CSV 둘 다 손봐야 합니다.
- 색상: `src/App.tsx` 상단의 `TEAM_STROKE_COLORS`, `AVERAGE_COLOR`.

## 이력 (참고)

- 과거 Vercel 배포 + 로그인 게이트(`/api/login`, `/api/data` HMAC 쿠키) 시도가 있었으나 현재 코드에는 적용되어 있지 않습니다. `prompts/2026-04-23_로그인게이트.md`에 기록만 남아 있습니다.
- 현재는 Vercel/서버 의존성이 전혀 없는 순수 정적 SPA입니다.

## 알려진 제약

- 사내 표준 폰트가 필요하면 `src/index.css` 또는 시스템 폰트로 조정.
- 인쇄 시 A4 기준 페이지 분할이 설정되어 있습니다 (다른 용지에서는 확인 필요).
