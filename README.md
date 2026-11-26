# 🚦 US ETF Pulse — 미국 ETF 데일리 신호등 & 환전 브리핑

한국 개인 투자자가 **PC와 휴대폰**에서 매일 최신화된 미국 ETF 가격 매력도, 환전 타이밍, 거시경제 지표, 그리고 **선택한 ETF에 얽힌 호재·악재 뉴스와 신호등**을 한눈에 확인할 수 있는 반응형 웹·PWA 앱입니다.

---

## 주요 기능

1. **오늘의 3대 투자 신호등 & 1분 브리핑**
   - 환전 타이밍(USD/KRW), 시장 심리(공포·탐욕 지수 & VIX), 거시경제(GDP·물가·금리)를 3구 신호등(🟢/🟡/🔴)으로 직관적으로 요약합니다.
2. **핵심 미국 ETF 10종 신호등 보드 (`VOO`, `QQQ`, `SCHD`, `SOXX`, `SMH`, `XLK`, `TLT`, `GLD`, `JEPI`, `VTI`)**
   - 카테고리·신호등 필터, 검색, 정렬(매력도순·낙폭큰순·호재많은순·배당순) 지원.
3. **ETF 선택 시 상세 분석 드로어 (PC 슬라이드 / 모바일 전체 화면)**
   - 대형 3구 신호등 + 매력도 점수 원형 게이지(0~100) + 4대 근거 분해 막대
   - 3개월/6개월/1년 인터랙티브 주가 & 200일 이동평균선 차트
   - **호재(Bull) vs 악재(Bear)** 핵심 요인 비교 카드
   - **해당 ETF에 얽힌 최신 기사 목록** (기사별 🟢호재 / 🔴악재 / 🟡중립 신호등 배지, 영향도, 필터, 원문 링크)
   - **원화 매수 & 환율 변동(환차익/환차손) 수익률 시뮬레이터**
4. **환전 타이밍 분석 (USD/KRW)**
   - 1년 백분위 게이지, 20/60/120일 이평선, 달러 인덱스(DXY), 구간별 분할 환전 가이드, 빠른 환전 계산기.
5. **거시경제 지표 & 국제 정황**
   - 미국 GDP, CPI/PCE, 연준 기준금리, 실업률, 장단기 금리차, VIX 및 관세·지정학 글로벌 뉴스(영향 ETF 바로가기), 주요 경제 일정 D-Day 캘린더.

---

## 실행 방법 (추가 프로그램 설치 불필요!)

### 1) PC & 같은 Wi-Fi 휴대폰에서 바로 실행
1. 폴더 안의 **`start.bat`** 파일을 더블 클릭합니다.
2. PC 브라우저에서 `http://localhost:8080` 이 자동으로 열립니다.
3. 검은 창에 표시되는 **`[휴대폰 접속] http://192.168.x.x:8080`** 주소를 같은 Wi-Fi에 연결된 휴대폰 브라우저에 입력하면 즉시 볼 수 있습니다.
4. 휴대폰 브라우저 메뉴에서 **"홈 화면에 추가"**를 누르면 일반 앱처럼 아이콘으로 사용할 수 있습니다 (PWA).
5. 상단의 **`지금 최신화`** 버튼을 누르면 Yahoo Finance · FRED · Google News RSS에서 실시간 시세와 기사를 다시 불러옵니다.

### 2) 매일 아침 자동 최신화 설정 (Windows)
PowerShell에서 아래 스크립트를 한 번 실행하면 매일 오전 7시 30분(미국 정규장 마감 직후) 자동으로 데이터를 갱신합니다.
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\register-daily-task.ps1
```

### 3) 외부 어디서나 휴대폰으로 접속하기 (무료 GitHub Pages 배포)
1. 이 폴더를 GitHub 저장소(Public)에 올립니다.
2. GitHub 저장소 **Settings → Pages → Branch: main** 으로 설정합니다.
3. 포함된 `.github/workflows/daily-update.yml` 워크플로가 평일 매일 오전 7시 10분(한국시간) 자동으로 최신 시세·환율·뉴스를 수집해 사이트를 자동 갱신합니다.

---

## 폴더 구조

```text
us-etf-pulse/
├── index.html                        # 반응형 메인 웹앱 (PC + 모바일 하단탭 + PWA)
├── styles.css                        # 다크/라이트 테마 및 반응형 스타일
├── app.js                            # 신호등, 인터랙티브 차트, 호재/악재 필터, 시뮬레이터
├── manifest.json / sw.js / icon.svg  # 모바일 홈화면 설치(PWA) 리소스
├── start.bat                         # 원클릭 로컬 + 휴대폰 Wi-Fi 서버 실행기
├── data/
│   ├── market-data.json              # 시장·환율·거시·ETF별 뉴스 데이터
│   └── market-data.js                # 로컬 파일 실행용 데이터 래퍼
├── scripts/
│   ├── start-server.ps1              # PC/휴대폰 HTTP 서버 및 /api/refresh 핸들러
│   ├── update-data.ps1               # Windows용 실시간 데이터·뉴스 수집기
│   ├── update-data.mjs               # GitHub Actions(Node 20+)용 자동 수집기
│   └── register-daily-task.ps1       # Windows 매일 자동 실행 등록기
└── .github/workflows/
    └── daily-update.yml              # GitHub Actions 매일 자동 최신화 파이프라인
```
