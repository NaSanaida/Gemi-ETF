/**
 * 제미나이 경제 - GitHub Actions / Node.js 20+ 전용 매일 자동 데이터 수집기 (외부 패키지 0개)
 * Yahoo Finance Chart API, FRED 공개 CSV, Bloomberg/CNBC 공식 RSS + 로이터/WSJ/국내경제 Google News RSS를 수집하고
 * 영문 기사는 자동 한국어 번역·요약하여 data/market-data.json 및 data/market-data.js를 갱신합니다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const jsonPath = path.join(rootDir, 'data', 'market-data.json');
const jsPath = path.join(rootDir, 'data', 'market-data.js');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const POSITIVE_KW = [
  '상승', '급등', '반등', '호재', '강세', '신고가', '돌파', '어닝 서프라이즈', '실적 호조', '금리 인하',
  '완화', '매수', '유입', '성장', '확대', '수혜', '기대감', '회복', '최고치', '배당 인상', '탄탄', '호조',
  'rally', 'surge', 'gain', 'bullish', 'beat', 'growth', 'record high', 'rate cut', 'inflow', 'upgrade', 'rebound', 'climb', 'rise'
];

const NEGATIVE_KW = [
  '하락', '급락', '폭락', '악재', '약세', '우려', '관세', '인플레이션', '물가 상승', '금리 인상', '긴축',
  '매도', '유출', '충격', '위축', '둔화', '리스크', '경고', '전쟁', '갈등', '부진', '조정', '공포', '하향', '압박',
  'drop', 'plunge', 'slump', 'bearish', 'tariff', 'inflation', 'rate hike', 'hawkish', 'outflow', 'selloff', 'recession', 'fear', 'fall', 'slide', 'tumble'
];

const ETF_QUERIES = {
  VOO: 'VOO S&P500 미국증시 ETF',
  SPLG: 'SPLG S&P500 미국증시 ETF',
  SPY: 'SPY S&P500 미국증시 ETF',
  VT: 'VT 전세계 주식 ETF',
  QQQ: 'QQQ 나스닥100 미국 기술주 ETF',
  QQQM: 'QQQM 나스닥100 ETF',
  SCHD: 'SCHD 미국 배당 ETF',
  SOXX: 'SOXX 미국 반도체 ETF 엔비디아',
  SMH: 'SMH 반도체 ETF AI',
  XLK: 'XLK 미국 테크 기술주 ETF',
  TLT: 'TLT 미국 장기국채 금리 ETF',
  IEF: 'IEF 미국 중기국채 금리 ETF',
  SHY: 'SHY 미국 단기국채 금리 ETF',
  SGOV: 'SGOV 미국 초단기국채 파킹 ETF',
  GLD: 'GLD 금값 국제금시세 ETF',
  XLE: 'XLE 미국 에너지 석유 ETF',
  USO: 'USO WTI 국제유가 ETF',
  JEPI: 'JEPI 미국 월배당 커버드콜 ETF',
  JEPQ: 'JEPQ 나스닥 월배당 ETF',
  VTI: 'VTI 미국 전체주식 ETF',
  TQQQ: 'TQQQ 나스닥 3배 레버리지 ETF',
  SOXL: 'SOXL 반도체 3배 레버리지 ETF',
  NRGU: 'NRGU 빅오일 에너지 3배 ETN',
  SQQQ: 'SQQQ 나스닥 3배 인버스 ETF'
};

const STOCK_QUERIES = {
  NVDA: '엔비디아 NVDA 주가 AI 반도체',
  AAPL: '애플 AAPL 아이폰 미국주식',
  MSFT: '마이크로소프트 MSFT 애저 AI 주가',
  AMZN: '아마존 AMZN AWS 미국주식',
  GOOGL: '구글 알파벳 GOOGL 제미나이 주가',
  META: '메타 META AI 광고 주가',
  TSLA: '테슬라 TSLA 전기차 자율주행 주가',
  AVGO: '브로드컴 AVGO AI 반도체 주가',
  AMD: 'AMD 반도체 AI 칩 주가',
  TSM: 'TSMC TSM 파운드리 반도체 주가',
  PLTR: '팔란티어 PLTR AI 소프트웨어 주가',
  ORCL: '오라클 ORCL 클라우드 AI 주가',
  'BRK-B': '버크셔 해서웨이 워렌버핏 주가',
  JPM: 'JP모건 JPM 미국 은행주 실적',
  KO: '코카콜라 KO 미국 배당주',
  O: '리얼티인컴 월배당 리츠 주가',
  COST: '코스트코 COST 미국 소비재 실적',
  LLY: '일라이릴리 LLY 비만치료제 주가',
  XOM: '엑슨모빌 XOM 국제유가 에너지 주가',
  LMT: '록히드마틴 LMT 미국 방산주'
};

const round2 = (n) => Math.round(n * 100) / 100;

function hasMostlyKorean(text) {
  const kr = (text.match(/[가-힣]/g) || []).length;
  const en = (text.match(/[A-Za-z]/g) || []).length;
  return kr >= 4 && kr >= en * 0.25;
}

function stripHtml(html) {
  return decodeXmlEntities(String(html || ''))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeXmlEntities(str) {
  return String(str || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function trimSummary(text, maxLen = 92) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 1).trim()}…`;
}

// 영문 제목·본문을 한국어로 자동 번역 (무료 Google Translate 공개 엔드포인트 사용)
async function translateEnToKo(text) {
  const clean = String(text || '').trim();
  if (!clean || hasMostlyKorean(clean)) return clean;
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ko&dt=t&q=${encodeURIComponent(clean)}`;
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const json = await res.json();
    if (Array.isArray(json?.[0])) {
      const translated = json[0].map((seg) => seg?.[0] || '').join('').trim();
      if (translated && hasMostlyKorean(translated)) return translated;
    }
  } catch (err) {
    console.warn('번역 실패:', err.message);
  }
  return null;
}

function classifySentiment(text) {
  const lower = String(text || '').toLowerCase();
  let pos = 0;
  let neg = 0;
  for (const kw of POSITIVE_KW) if (lower.includes(kw.toLowerCase())) pos++;
  for (const kw of NEGATIVE_KW) if (lower.includes(kw.toLowerCase())) neg++;
  if (pos > neg) return { sentiment: 'positive', impactLevel: pos >= 2 ? '높음' : '보통' };
  if (neg > pos) return { sentiment: 'negative', impactLevel: neg >= 2 ? '높음' : '보통' };
  return { sentiment: 'neutral', impactLevel: '보통' };
}

function buildDigest(title, rawDesc, sentiment, affectedEtfs = []) {
  const desc = stripHtml(rawDesc);
  const etfList = affectedEtfs.length ? affectedEtfs.join('·') : '미국 대표 ETF';
  const normTitle = title.replace(/\s+/g, '');
  const normDesc = desc.replace(/\s+/g, '');
  const hasRichDesc = desc.length >= 20 && hasMostlyKorean(desc) && !normDesc.startsWith(normTitle.slice(0, 16));

  const what = hasRichDesc ? trimSummary(desc, 130) : `${title} 관련 최신 시장 동향이 전해졌습니다.`;

  let impact = '';
  let action = '';
  if (/관세|무역|중국|유럽|트럼프|지정학|전쟁|중동/.test(title)) {
    impact =
      sentiment === 'positive'
        ? `무역·지정학 긴장 완화로 ${etfList} 및 글로벌 공급망 투자심리에 긍정적입니다.`
        : `관세·지정학 불확실성이 커지며 ${etfList}의 원가 부담과 단기 변동성이 확대될 수 있습니다.`;
    action =
      sentiment === 'positive'
        ? '심리 개선 흐름을 확인하며 분할 매수 비중을 점진적으로 유지하세요.'
        : '이슈 윤곽이 잡힐 때까지 반도체·레버리지 추격 매수는 피하고 분할 대응하세요.';
  } else if (/연준|금리|FOMC|파월|물가|CPI|PCE|인플레이션/.test(title)) {
    impact =
      sentiment === 'positive'
        ? `물가 진정·금리 완화 기대로 성장주(QQQM)와 장기국채(TLT)에 우호적인 환경입니다.`
        : `물가·금리 경계감이 커지며 기술주 밸류에이션은 부담되고, 초단기채(SGOV)·배당주가 상대적으로 유리합니다.`;
    action =
      sentiment === 'positive'
        ? '우량 지수(SPLG·QQQM)와 장기채(TLT) 중심으로 계획된 적립 매수를 이어가세요.'
        : 'FOMC·CPI 발표 전후 변동성에 대비해 현금은 SGOV로 대기하고 나눠 진입하세요.';
  } else if (/반도체|엔비디아|AI|나스닥|빅테크|애플|마이크로소프트/.test(title)) {
    impact =
      sentiment === 'positive'
        ? `AI·빅테크 실적 및 수요 기대감이 ${etfList}의 상승 모멘텀을 지지합니다.`
        : `AI 밸류에이션 부담과 차익실현 매물로 ${etfList}의 단기 등락폭이 커질 수 있습니다.`;
    action =
      sentiment === 'positive'
        ? '과열 여부를 RSI로 점검하면서 QQQM·SPLG 중심으로 분할 접근하세요.'
        : '200일 이동평균선 지지 여부를 확인한 뒤 천천히 분할 매수하는 전략이 안전합니다.';
  } else if (/국채|채권|금값|금시세|달러|환율/.test(title)) {
    impact =
      sentiment === 'positive'
        ? `안전자산 수급 개선 또는 환율 안정으로 ${etfList} 및 달러 환전 여건이 우호적입니다.`
        : `금리·환율 변동성 확대로 ${etfList}의 단기 가격 출렁임에 유의해야 합니다.`;
    action = '환율과 금리 추이를 함께 보며 주식·채권(TLT/SGOV) 비중 균형을 점검하세요.';
  } else {
    impact =
      sentiment === 'positive'
        ? `${etfList}의 수급과 실적 전망에 우호적인 흐름으로 분류된 이슈입니다.`
        : sentiment === 'negative'
          ? `단기 투자심리 위축으로 ${etfList}에 변동성이 커질 수 있는 경계 이슈입니다.`
          : `${etfList}의 중기 방향성과 섹터 순환 흐름을 가늠할 참고 이슈입니다.`;
    action =
      sentiment === 'negative'
        ? '일괄 매수보다 3~5회 분할 매수와 현금 비중 유지로 변동성에 대비하세요.'
        : '기존 적립식 투자 원칙을 유지하며 관련 ETF 신호등 점수를 함께 확인하세요.';
  }

  return { what, impact, action };
}

function buildSmartSummary(title, rawDesc, sentiment) {
  const desc = stripHtml(rawDesc);
  // 설명이 제목과 거의 같거나 너무 짧으면 핵심 영향 요약 자동 생성
  const normTitle = title.replace(/\s+/g, '');
  const normDesc = desc.replace(/\s+/g, '');
  if (desc.length >= 18 && !normDesc.startsWith(normTitle.slice(0, 18)) && hasMostlyKorean(desc)) {
    return trimSummary(desc, 92);
  }
  if (/관세|무역|중국|유럽|트럼프|지정학|전쟁|중동/.test(title)) {
    return sentiment === 'positive'
      ? '무역·지정학 긴장 완화 조짐 → 글로벌 공급망·증시 투자심리 개선 요인'
      : '관세·지정학 불확실성 확대 → 반도체·다국적 기업 마진 부담 및 변동성 주의';
  }
  if (/연준|금리|FOMC|파월|물가|CPI|PCE|인플레이션/.test(title)) {
    return sentiment === 'positive'
      ? '물가 둔화·금리 완화 기대 → 성장주(QQQM) 및 장기국채(TLT)에 우호적'
      : '고물가·긴축 경계 확대 → 기술주 밸류에이션 부담, 초단기채(SGOV)·배당주 유리';
  }
  if (/반도체|엔비디아|AI|나스닥|빅테크|애플|마이크로소프트/.test(title)) {
    return sentiment === 'positive'
      ? 'AI·빅테크 실적 및 수요 모멘텀 강화 → QQQM·SOXX·SMH 상승 동력'
      : 'AI 밸류에이션·차익실현 압력 → 반도체·기술주 단기 변동성 경계 필요';
  }
  if (/국채|채권|금값|금시세|달러|환율/.test(title)) {
    return sentiment === 'positive'
      ? '안전자산·채권 수급 개선 또는 환율 안정 흐름 → 방어 자산 및 분할 환전 우호적'
      : '금리·강달러 변동성 확대 → 채권(TLT)·금(GLD) 및 환전 타이밍 분할 대응 권장';
  }
  if (/배당|가치주|SCHD|JEPI|JEPQ/.test(title)) {
    return sentiment === 'positive'
      ? '현금흐름 우량 배당·가치주 관심 확대 → 하락장 방어 및 월배당 매력 부각'
      : '금리 부담으로 배당주 단기 탄력 둔화 → 장기 적립식 분할 접근 유효';
  }
  return sentiment === 'positive'
    ? '미국 증시 및 관련 ETF 수급·실적에 긍정적인 모멘텀으로 평가되는 이슈'
    : sentiment === 'negative'
      ? '단기 투자심리 위축 및 변동성 확대 요인으로 분할 대응이 필요한 이슈'
      : '미국 시장 방향성과 섹터 흐름을 점검하기 위해 참고할 핵심 이슈';
}

function detectAffectedEtfs(text) {
  const t = String(text || '');
  if (/관세|무역|중국|반도체|엔비디아|TSMC/.test(t)) return ['SOXX', 'SMH', 'QQQM'];
  if (/연준|금리|FOMC|CPI|PCE|물가|인플레이션/.test(t)) return ['SGOV', 'TLT', 'QQQM', 'SCHD'];
  if (/AI|나스닥|빅테크|기술주|애플|마이크로소프트/.test(t)) return ['QQQM', 'QQQ', 'XLK'];
  if (/국채|채권|안전자산/.test(t)) return ['TLT', 'SGOV', 'GLD'];
  if (/금값|국제금|원자재|전쟁|중동|유가/.test(t)) return ['GLD', 'TLT', 'SPLG'];
  if (/배당|가치주|순환매/.test(t)) return ['SCHD', 'JEPI', 'SPLG'];
  return ['SPLG', 'VOO', 'QQQM'];
}

function calcRsi14(closes) {
  if (closes.length < 15) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - 14; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const avgGain = gains / 14;
  const avgLoss = losses / 14;
  if (avgLoss === 0) return 100;
  return Math.round((100 - 100 / (1 + avgGain / avgLoss)) * 10) / 10;
}

function calcMA(values, window) {
  if (!values.length) return 0;
  const slice = values.slice(-Math.min(window, values.length));
  return round2(slice.reduce((a, b) => a + b, 0) / slice.length);
}

async function fetchYahooChart(symbol, range = '1y') {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;
    const meta = result.meta || {};
    const ts = result.timestamp || [];
    const closes = result.indicators?.quote?.[0]?.close || [];
    const points = [];
    for (let i = 0; i < ts.length; i++) {
      if (closes[i] != null) {
        points.push({ date: new Date(ts[i] * 1000).toISOString().slice(0, 10), close: round2(Number(closes[i])) });
      }
    }
    const livePrice = meta.regularMarketPrice != null ? round2(Number(meta.regularMarketPrice)) : null;
    if (livePrice != null && points.length) {
      points[points.length - 1].close = livePrice;
    }
    return { points, livePrice };
  } catch (err) {
    console.warn(`Yahoo 실패 (${symbol}):`, err.message);
    return null;
  }
}

async function fetchFredLatest(seriesId) {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${seriesId}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    const text = await res.text();
    const lines = text.trim().split(/\r?\n/).filter((l) => !l.startsWith('DATE') && !l.endsWith(',.'));
    if (lines.length < 2) return null;
    const [date, val] = lines[lines.length - 1].split(',');
    const [, prev] = lines[lines.length - 2].split(',');
    return { date, value: Number(val), prev: Number(prev) };
  } catch (err) {
    console.warn(`FRED 실패 (${seriesId}):`, err.message);
    return null;
  }
}

function formatShortDate(pubRaw) {
  const d = pubRaw ? new Date(pubRaw) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${String(kst.getUTCMonth() + 1).padStart(2, '0')}.${String(kst.getUTCDate()).padStart(2, '0')} ${String(kst.getUTCHours()).padStart(2, '0')}:${String(kst.getUTCMinutes()).padStart(2, '0')}`;
}

// 영문 공식 RSS (Bloomberg, CNBC 등) 수집 + 자동 한국어 번역·요약
async function fetchEnglishRssTranslated(feedUrl, sourceName, limit = 2) {
  try {
    const res = await fetch(feedUrl, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, limit + 2);
    const out = [];
    for (const m of items) {
      if (out.length >= limit) break;
      const block = m[1];
      const rawTitle = stripHtml(block.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '');
      const rawDesc = stripHtml(block.match(/<description>([\s\S]*?)<\/description>/)?.[1] || '');
      const link = decodeXmlEntities((block.match(/<link>([\s\S]*?)<\/link>/)?.[1] || '').trim());
      const pubRaw = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || '').trim();
      if (!rawTitle || !link) continue;

      const koTitle = await translateEnToKo(rawTitle);
      if (!koTitle) continue; // 번역 실패 시 미번역 영문 기사는 제외
      const koDesc = rawDesc ? await translateEnToKo(trimSummary(rawDesc, 160)) : '';

      const sent = classifySentiment(`${rawTitle} ${koTitle} ${koDesc || ''}`);
      const affected = detectAffectedEtfs(`${koTitle} ${koDesc || ''}`);
      out.push({
        title: koTitle,
        source: sourceName,
        publishedAt: formatShortDate(pubRaw),
        sentiment: sent.sentiment,
        impactLevel: sent.impactLevel,
        summary: buildSmartSummary(koTitle, koDesc || '', sent.sentiment),
        digest: buildDigest(koTitle, koDesc || '', sent.sentiment, affected),
        url: link
      });
    }
    return out;
  } catch (err) {
    console.warn(`${sourceName} RSS 실패:`, err.message);
    return [];
  }
}

// 한국어 Google News RSS 수집 (로이터/WSJ/국내경제 포함)
async function fetchGoogleNews(query, limit = 4) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(12000) });
    if (!res.ok) return [];
    const xml = await res.text();
    const itemMatches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, limit + 2);
    const out = [];
    for (const m of itemMatches) {
      if (out.length >= limit) break;
      const block = m[1];
      const rawTitle = stripHtml(block.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '');
      const rawDesc = stripHtml(block.match(/<description>([\s\S]*?)<\/description>/)?.[1] || '');
      const link = decodeXmlEntities((block.match(/<link>([\s\S]*?)<\/link>/)?.[1] || '').trim());
      const pubRaw = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || '').trim();
      if (!rawTitle || !link) continue;

      const dashIdx = rawTitle.lastIndexOf(' - ');
      let title = dashIdx > 0 ? rawTitle.slice(0, dashIdx).trim() : rawTitle;
      const source = dashIdx > 0 ? rawTitle.slice(dashIdx + 3).trim() : '경제 뉴스';

      if (!hasMostlyKorean(title)) {
        const ko = await translateEnToKo(title);
        if (!ko) continue;
        title = ko;
      }

      const sent = classifySentiment(title);
      const affected = detectAffectedEtfs(`${title} ${rawDesc || ''}`);
      out.push({
        title,
        source,
        publishedAt: formatShortDate(pubRaw),
        sentiment: sent.sentiment,
        impactLevel: sent.impactLevel,
        summary: buildSmartSummary(title, rawDesc, sent.sentiment),
        digest: buildDigest(title, rawDesc, sent.sentiment, affected),
        url: link
      });
    }
    return out;
  } catch (err) {
    console.warn(`뉴스 RSS 실패 (${query}):`, err.message);
    return [];
  }
}

function dedupeNews(items, maxCount = 8) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = item.title.replace(/[^가-힣a-zA-Z0-9]/g, '').slice(0, 18);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= maxCount) break;
  }
  return result;
}

async function main() {
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  let okCount = 0;

  // 1. 환율 및 DXY
  const fxChart = await fetchYahooChart('KRW=X', '1y');
  if (fxChart && fxChart.points.length > 20) {
    okCount++;
    const closes = fxChart.points.map((p) => p.close);
    const cur = closes[closes.length - 1];
    const prev = closes[closes.length - 2];
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const pct1Y = max > min ? Math.round(((cur - min) / (max - min)) * 100) : 50;
    const light = pct1Y <= 40 ? 'green' : pct1Y <= 70 ? 'yellow' : 'red';
    const rec =
      light === 'green'
        ? '1년 평균보다 낮아 분할 환전에 유리해요'
        : light === 'yellow'
          ? '1년 중간 구간 · 정기 분할 환전이 적합해요'
          : '1년 상단권 · 환율 부담이 커 소액 분할 권장';

    data.fx.usdKrw = cur;
    data.fx.changePct = round2(((cur - prev) / prev) * 100);
    data.fx.percentile1Y = pct1Y;
    data.fx.ma20 = calcMA(closes, 20);
    data.fx.ma60 = calcMA(closes, 60);
    data.fx.ma120 = calcMA(closes, 120);
    data.fx.high52w = round2(max);
    data.fx.low52w = round2(min);
    data.fx.light = light;
    data.fx.recommendation = rec;

    const step = Math.max(1, Math.floor(fxChart.points.length / 60));
    data.fx.history = fxChart.points
      .filter((_, i) => i % step === 0 || i === fxChart.points.length - 1)
      .map((p) => ({ date: p.date, value: p.close }));

    data.overview.fxSignal.light = light;
    data.overview.fxSignal.score = 100 - pct1Y;
    data.overview.fxSignal.label = light === 'green' ? '환전 유리' : light === 'yellow' ? '분할 환전' : '환율 부담';
    data.overview.fxSignal.summary = `1년 중 ${pct1Y <= 40 ? '싼 편' : pct1Y <= 70 ? '보통' : '비싼 편'} (하위 ${pct1Y}%)`;
  }

  const dxyChart = await fetchYahooChart('DX-Y.NYB', '1mo');
  if (dxyChart && dxyChart.points.length >= 2) {
    okCount++;
    const cur = dxyChart.points[dxyChart.points.length - 1].close;
    const prev = dxyChart.points[dxyChart.points.length - 2].close;
    data.fx.dxy = cur;
    data.fx.dxyChangePct = round2(((cur - prev) / prev) * 100);
  }

  // 2. VIX & FRED
  const vixChart = await fetchYahooChart('^VIX', '1mo');
  if (vixChart && vixChart.points.length) {
    okCount++;
    const curVix = vixChart.points[vixChart.points.length - 1].close;
    data.overview.marketSentiment.vix = curVix;
    const vixInd = data.macro.indicators.find((x) => x.id === 'vix');
    if (vixInd) {
      vixInd.value = String(curVix);
      vixInd.numValue = curVix;
      vixInd.light = curVix < 18 ? 'green' : curVix < 25 ? 'yellow' : 'red';
      vixInd.tag = curVix < 18 ? '변동성 안정' : curVix < 25 ? '경계 구간' : '변동성 확대';
    }
  }

  // WTI 국제유가 & 미국 10년물 국채금리 실시간 반영
  const oilChart = await fetchYahooChart('CL=F', '1mo');
  if (oilChart && oilChart.points.length >= 2) {
    okCount++;
    const curOil = oilChart.points[oilChart.points.length - 1].close;
    const prevOil = oilChart.points[oilChart.points.length - 2].close;
    const oilInd = data.macro.indicators.find((x) => x.id === 'oil');
    if (oilInd) {
      oilInd.value = `$${curOil.toFixed(2)}`;
      oilInd.numValue = curOil;
      oilInd.prev = `$${prevOil.toFixed(2)}`;
      oilInd.light = curOil <= 75 ? 'green' : curOil <= 82 ? 'yellow' : 'red';
      oilInd.tag = curOil <= 75 ? '물가 안정' : curOil <= 82 ? '중립 경계' : '물가 자극 경계';
    }
  }

  const tnxChart = await fetchYahooChart('^TNX', '1mo');
  if (tnxChart && tnxChart.points.length >= 2) {
    okCount++;
    const cur10y = round2(tnxChart.points[tnxChart.points.length - 1].close);
    const prev10y = round2(tnxChart.points[tnxChart.points.length - 2].close);
    const ind10y = data.macro.indicators.find((x) => x.id === 'us10y');
    if (ind10y) {
      ind10y.value = `${cur10y}%`;
      ind10y.numValue = cur10y;
      ind10y.prev = `${prev10y}%`;
      ind10y.light = cur10y <= 4.2 ? 'green' : cur10y <= 4.9 ? 'yellow' : 'red';
    }
  }

  for (const [id, series] of [
    ['fed', 'FEDFUNDS'],
    ['unemp', 'UNRATE'],
    ['spread', 'T10Y2Y'],
    ['us2y', 'DGS2'],
    ['hy', 'BAMLH0A0HYM2']
  ]) {
    const fr = await fetchFredLatest(series);
    if (fr) {
      okCount++;
      const ind = data.macro.indicators.find((x) => x.id === id);
      if (ind) {
        ind.value = `${round2(fr.value)}%`;
        ind.numValue = round2(fr.value);
        ind.prev = `${round2(fr.prev)}%`;
        ind.period = fr.date;
      }
    }
  }

  // 3. ETF 24종 + 미국 개별주식 20종 최신 시세·지표·한글 뉴스
  const allTargets = [...(data.etfs || []), ...(data.stocks || [])];
  for (const etf of allTargets) {
    const chart = await fetchYahooChart(etf.ticker, '1y');
    if (chart && chart.points.length > 20) {
      okCount++;
      const closes = chart.points.map((p) => p.close);
      const cur = closes[closes.length - 1];
      const prev = closes[closes.length - 2];
      const high52 = Math.max(...closes);
      const low52 = Math.min(...closes);
      const mdd = round2(((cur - high52) / high52) * 100);
      const rsi14 = calcRsi14(closes);
      const ma200 = calcMA(closes, 200);
      const ma200Diff = ma200 > 0 ? round2(((cur - ma200) / ma200) * 100) : 0;

      const qText = ETF_QUERIES[etf.ticker] || STOCK_QUERIES[etf.ticker] || `${etf.ticker} 미국 주식`;
      const news = await fetchGoogleNews(qText, 4);
      if (news.length) etf.news = dedupeNews(news, 4);

      const pos = etf.news.filter((n) => n.sentiment === 'positive').length;
      const neg = etf.news.filter((n) => n.sentiment === 'negative').length;
      const newsScore = Math.min(95, Math.max(15, 50 + (pos - neg) * 12));
      const valScore = Math.min(95, Math.max(25, Math.round(55 + Math.abs(mdd) * 2.5)));
      const techScore = rsi14 < 35 ? 86 : rsi14 < 48 ? 74 : rsi14 < 62 ? 58 : rsi14 < 72 ? 42 : 28;
      const fxBonus = 100 - data.fx.percentile1Y;
      const score = Math.round(valScore * 0.35 + techScore * 0.3 + newsScore * 0.2 + fxBonus * 0.15);
      const light = score >= 68 ? 'green' : score >= 48 ? 'yellow' : 'red';

      etf.price = cur;
      etf.changePct = round2(((cur - prev) / prev) * 100);
      etf.high52w = round2(high52);
      etf.low52w = round2(low52);
      etf.mddFromHigh = mdd;
      etf.rsi14 = rsi14;
      etf.ma200 = ma200;
      etf.ma200DiffPct = ma200Diff;
      etf.return1M = Math.round(((cur - closes[Math.max(0, closes.length - 22)]) / closes[Math.max(0, closes.length - 22)]) * 1000) / 10;
      etf.return3M = Math.round(((cur - closes[Math.max(0, closes.length - 64)]) / closes[Math.max(0, closes.length - 64)]) * 1000) / 10;
      etf.return1Y = Math.round(((cur - closes[0]) / closes[0]) * 1000) / 10;
      etf.score = score;
      etf.light = light;
      etf.actionBadge = light === 'green' ? '분할매수 유리' : light === 'yellow' ? '중립 · 분할' : '변동성 주의';
      etf.breakdown = { valuation: valScore, technical: techScore, newsSentiment: newsScore, fxBonus };

      // 매력적인 가격 구간(적극 분할 / 적정 적립 / 추격 주의) 자동 재계산
      if (etf.ticker === 'SGOV') {
        etf.priceZones = {
          buyLow: round2(low52),
          buyHigh: round2(cur + 0.15),
          fairHigh: round2(high52 + 0.2),
          overPrice: round2(high52 + 0.2),
          status: '수시 매수 구간',
          light: 'green',
          note: '초단기국채 특성상 가격 변동이 거의 없어 언제든 파킹 가능'
        };
      } else {
        const buyLow = round2(Math.max(low52, ma200 * 0.94));
        let buyHigh = round2(Math.min(high52 * 0.92, ma200 * 1.01));
        if (buyHigh <= buyLow) buyHigh = round2(buyLow * 1.04);
        const fairHigh = round2(Math.max(buyHigh * 1.04, high52 * 0.97));
        const status = cur <= buyHigh ? '적극 분할 구간' : cur <= fairHigh ? '적정 적립 구간' : '추격 주의 구간';
        const zLight = cur <= buyHigh ? 'green' : cur <= fairHigh ? 'yellow' : 'red';
        const note =
          zLight === 'green'
            ? '200일선 부근 또는 고점 대비 충분히 눌린 저평가 매수 구간'
            : zLight === 'yellow'
              ? '고점 대비 과열이 식은 구간 · 정기 분할 매수에 무리 없음'
              : '52주 고점 근접 · 일괄 매수보다 눌림목 대기 권장';
        etf.priceZones = { buyLow, buyHigh, fairHigh, overPrice: fairHigh, status, light: zLight, note };
      }

      const step = Math.max(1, Math.floor(chart.points.length / 60));
      etf.history = chart.points
        .filter((_, i) => i % step === 0 || i === chart.points.length - 1)
        .map((p) => ({ date: p.date, close: p.close, ma200 }));
    }
  }

  // 4. 다매체 글로벌·국제정황 뉴스 (Bloomberg + CNBC + 로이터/WSJ + 국내 주요 경제지, 100% 한글 번역·요약)
  const [bbMarkets, cnbcNews, wireNews, krMacroNews] = await Promise.all([
    fetchEnglishRssTranslated('https://feeds.bloomberg.com/markets/news.rss', 'Bloomberg', 2),
    fetchEnglishRssTranslated('https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664', 'CNBC', 2),
    fetchGoogleNews('로이터 OR WSJ OR 파이낸셜타임스 미국 증시 연준 관세', 3),
    fetchGoogleNews('미국 증시 연준 금리 관세 달러 반도체 국채', 3)
  ]);

  const combinedGlobal = dedupeNews([...bbMarkets, ...cnbcNews, ...wireNews, ...krMacroNews], 8);
  if (combinedGlobal.length) {
    okCount++;
    data.macro.globalNews = combinedGlobal.map((n, idx) => {
      const affectedEtfs = detectAffectedEtfs(`${n.title} ${n.summary}`);
      return {
        id: `live-${idx + 1}`,
        ...n,
        digest: n.digest || buildDigest(n.title, n.summary, n.sentiment, affectedEtfs),
        affectedEtfs
      };
    });
    // 상단 30초 국제 정황 요약 자동 생성
    const top3 = data.macro.globalNews.slice(0, 3);
    data.macro.globalSummary = top3.map((n) => ({
      topic: /관세|무역|중국|전쟁/.test(n.title)
        ? '무역·지정학'
        : /연준|금리|물가|CPI|PCE/.test(n.title)
          ? '물가·금리'
          : /반도체|AI|나스닥|빅테크/.test(n.title)
            ? '기술·AI'
            : /국채|채권|환율|달러|금/.test(n.title)
              ? '채권·환율'
              : '글로벌 증시',
      light: n.sentiment === 'positive' ? 'green' : n.sentiment === 'negative' ? 'red' : 'yellow',
      text: trimSummary(n.title, 54)
    }));
  }

  // KST 시각 갱신
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kst.getUTCDate()).padStart(2, '0');
  const hh = String(kst.getUTCHours()).padStart(2, '0');
  const mm = String(kst.getUTCMinutes()).padStart(2, '0');
  data.meta.updatedAt = `${y}-${m}-${d}T${hh}:${mm}:00+09:00`;
  data.meta.updatedLabel = `자료 ${m}.${d} ${hh}:${mm} · 15분 자동`;
  data.meta.dataProvidedAt = `${m}.${d} (${days[kst.getUTCDay()]}) ${hh}:${mm}`;
  data.meta.sourceMode = okCount > 0 ? 'live' : 'snapshot';

  const serialized = JSON.stringify(data, null, 2);
  fs.writeFileSync(jsonPath, serialized, 'utf8');
  fs.writeFileSync(jsPath, `window.MARKET_DATA = ${serialized};\n`, 'utf8');
  console.log(`업데이트 완료: 성공 항목 ${okCount}개 (${data.meta.updatedLabel})`);
}

main();
