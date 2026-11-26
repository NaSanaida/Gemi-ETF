/**
 * US ETF Pulse - GitHub Actions / Node.js 20+ 전용 매일 자동 데이터 수집기 (외부 패키지 0개)
 * Yahoo Finance Chart API, FRED 공개 CSV, Google News RSS를 수집하여
 * data/market-data.json 및 data/market-data.js를 자동 갱신합니다.
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
  '완화', '매수', '유입', '성장', '확대', '수혜', '기대감', '회복', '최고치', '배당 인상', '탄탄',
  'rally', 'surge', 'gain', 'bullish', 'beat', 'growth', 'record high', 'rate cut', 'inflow', 'upgrade', 'rebound'
];

const NEGATIVE_KW = [
  '하락', '급락', '폭락', '악재', '약세', '우려', '관세', '인플레이션', '물가 상승', '금리 인상', '긴축',
  '매도', '유출', '충격', '위축', '둔화', '리스크', '경고', '전쟁', '갈등', '부진', '조정', '공포', '하향',
  'drop', 'plunge', 'slump', 'bearish', 'tariff', 'inflation', 'rate hike', 'hawkish', 'outflow', 'selloff', 'recession', 'fear'
];

const ETF_QUERIES = {
  VOO: 'VOO S&P500 미국증시 ETF',
  SPLG: 'SPLG S&P500 미국증시 ETF',
  SPY: 'SPY S&P500 미국증시 ETF',
  QQQ: 'QQQ 나스닥100 미국 기술주 ETF',
  QQQM: 'QQQM 나스닥100 ETF',
  SCHD: 'SCHD 미국 배당 ETF',
  SOXX: 'SOXX 미국 반도체 ETF 엔비디아',
  SMH: 'SMH 반도체 ETF AI',
  XLK: 'XLK 미국 테크 기술주 ETF',
  TLT: 'TLT 미국 장기국채 금리 ETF',
  SGOV: 'SGOV 미국 초단기국채 파킹 ETF',
  GLD: 'GLD 금값 국제금시세 ETF',
  JEPI: 'JEPI 미국 월배당 커버드콜 ETF',
  JEPQ: 'JEPQ 나스닥 월배당 ETF',
  VTI: 'VTI 미국 전체주식 ETF',
  TQQQ: 'TQQQ 나스닥 3배 레버리지 ETF'
};

const round2 = (n) => Math.round(n * 100) / 100;

function classifySentiment(text) {
  const lower = text.toLowerCase();
  let pos = 0;
  let neg = 0;
  for (const kw of POSITIVE_KW) if (lower.includes(kw.toLowerCase())) pos++;
  for (const kw of NEGATIVE_KW) if (lower.includes(kw.toLowerCase())) neg++;
  if (pos > neg) return { sentiment: 'positive', impactLevel: pos >= 2 ? '높음' : '보통' };
  if (neg > pos) return { sentiment: 'negative', impactLevel: neg >= 2 ? '높음' : '보통' };
  return { sentiment: 'neutral', impactLevel: '보통' };
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
    const ts = result.timestamp || [];
    const closes = result.indicators?.quote?.[0]?.close || [];
    const points = [];
    for (let i = 0; i < ts.length; i++) {
      if (closes[i] != null) {
        const d = new Date(ts[i] * 1000);
        const date = d.toISOString().slice(0, 10);
        points.push({ date, close: round2(Number(closes[i])) });
      }
    }
    return { points };
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

function decodeXmlEntities(str) {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function fetchGoogleNews(query, limit = 5) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(12000) });
    if (!res.ok) return [];
    const xml = await res.text();
    const itemMatches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, limit);
    return itemMatches.map((m) => {
      const block = m[1];
      const rawTitle = decodeXmlEntities((block.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '').trim());
      const link = decodeXmlEntities((block.match(/<link>([\s\S]*?)<\/link>/)?.[1] || '').trim());
      const pubRaw = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || '').trim();
      const dashIdx = rawTitle.lastIndexOf(' - ');
      const title = dashIdx > 0 ? rawTitle.slice(0, dashIdx).trim() : rawTitle;
      const source = dashIdx > 0 ? rawTitle.slice(dashIdx + 3).trim() : '뉴스';
      const sent = classifySentiment(title);
      const d = pubRaw ? new Date(pubRaw) : new Date();
      const publishedAt = Number.isNaN(d.getTime())
        ? new Date().toISOString().slice(0, 10)
        : `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      const summary =
        sent.sentiment === 'positive'
          ? '긍정적 모멘텀 또는 수급·실적 개선 신호로 분류된 최신 기사입니다.'
          : sent.sentiment === 'negative'
            ? '단기 변동성 확대 또는 거시·업황 부담 요인으로 분류된 최신 기사입니다.'
            : '시장 방향성을 가늠하기 위해 함께 참고할 중립적 최신 이슈입니다.';
      return { title, source, publishedAt, sentiment: sent.sentiment, impactLevel: sent.impactLevel, summary, url: link };
    });
  } catch (err) {
    console.warn(`뉴스 RSS 실패 (${query}):`, err.message);
    return [];
  }
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
        ? '최근 1년 기준 하단권 · 분할 환전 유리 구간'
        : light === 'yellow'
          ? '최근 1년 중간 구간 · 정기 적립식 분할 환전 적합'
          : '최근 1년 상단권 · 환율 부담 높음 (소액 분할 권장)';

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
    data.fx.history = fxChart.points.filter((_, i) => i % step === 0 || i === fxChart.points.length - 1).map((p) => ({
      date: p.date,
      value: p.close
    }));

    data.overview.fxSignal.light = light;
    data.overview.fxSignal.score = 100 - pct1Y;
    data.overview.fxSignal.label = light === 'green' ? '환전 우호적' : light === 'yellow' ? '분할 환전' : '환율 부담';
    data.overview.fxSignal.summary = `원/달러 ${cur.toLocaleString('ko-KR')}원 (1년 백분위 ${pct1Y}%). ${rec}.`;
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
      vixInd.light = curVix < 18 ? 'green' : curVix < 25 ? 'yellow' : 'red';
      vixInd.tag = curVix < 18 ? '변동성 안정' : curVix < 25 ? '경계 구간' : '공포·변동성 확대';
    }
  }

  for (const [id, series] of [['fed', 'FEDFUNDS'], ['unemp', 'UNRATE'], ['spread', 'T10Y2Y']]) {
    const fr = await fetchFredLatest(series);
    if (fr) {
      okCount++;
      const ind = data.macro.indicators.find((x) => x.id === id);
      if (ind) {
        ind.value = `${round2(fr.value)}%`;
        ind.prev = `${round2(fr.prev)}%`;
        ind.period = fr.date;
      }
    }
  }

  // 3. ETF별 최신 시세·지표·뉴스
  for (const etf of data.etfs) {
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

      const news = await fetchGoogleNews(ETF_QUERIES[etf.ticker] || `${etf.ticker} 미국 ETF`, 5);
      if (news.length) etf.news = news;

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
      etf.actionBadge = light === 'green' ? '분할매수 매력' : light === 'yellow' ? '중립 · 적립식 유지' : '단기 과열 · 변동성 경계';
      etf.breakdown = { valuation: valScore, technical: techScore, newsSentiment: newsScore, fxBonus };

      const step = Math.max(1, Math.floor(chart.points.length / 60));
      etf.history = chart.points
        .filter((_, i) => i % step === 0 || i === chart.points.length - 1)
        .map((p) => ({ date: p.date, close: p.close, ma200 }));
    }
  }

async function fetchBloombergRss(limit = 4) {
  const feeds = [
    'https://feeds.bloomberg.com/markets/news.rss',
    'https://feeds.bloomberg.com/economics/news.rss'
  ];
  const out = [];
  for (const url of feeds) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      const xml = await res.text();
      const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, Math.ceil(limit / 2));
      for (const m of items) {
        const block = m[1];
        const title = decodeXmlEntities((block.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '').trim());
        const link = decodeXmlEntities((block.match(/<link>([\s\S]*?)<\/link>/)?.[1] || '').trim());
        const pubRaw = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || '').trim();
        if (!title || !link) continue;
        const sent = classifySentiment(title);
        const d = pubRaw ? new Date(pubRaw) : new Date();
        const publishedAt = Number.isNaN(d.getTime())
          ? ''
          : `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        out.push({
          title: `[블룸버그] ${title}`,
          source: 'Bloomberg',
          publishedAt,
          sentiment: sent.sentiment,
          impactLevel: sent.impactLevel,
          summary:
            sent.sentiment === 'positive'
              ? '블룸버그 마켓 속보: 시장에 우호적인 흐름으로 분류된 기사입니다.'
              : sent.sentiment === 'negative'
                ? '블룸버그 마켓 속보: 단기 변동성·경계 요인으로 분류된 기사입니다.'
                : '블룸버그 마켓 속보: 미국 증시·거시 방향성 참고 기사입니다.',
          url: link
        });
      }
    } catch (err) {
      console.warn(`Bloomberg RSS 실패 (${url}):`, err.message);
    }
  }
  return out.slice(0, limit);
}

  // 4. 글로벌 매크로 뉴스 (Bloomberg RSS + 한국어 블룸버그/거시 뉴스 병합)
  const bbNews = await fetchBloombergRss(4);
  const krMacroNews = await fetchGoogleNews('블룸버그 미국증시 연준 금리 관세 CPI', 4);
  const gNews = [...bbNews, ...krMacroNews].slice(0, 7);
  if (gNews.length) {
    okCount++;
    data.macro.globalNews = gNews.map((n, idx) => ({
      id: `live-${idx + 1}`,
      ...n,
      affectedEtfs: /금리|채권|국채|연준/.test(n.title)
        ? ['TLT', 'VOO', 'SCHD']
        : /반도체|AI|엔비디아|기술/.test(n.title)
          ? ['SOXX', 'SMH', 'QQQ']
          : /금값|안전자산|전쟁|관세/.test(n.title)
            ? ['GLD', 'TLT', 'VOO']
            : ['VOO', 'QQQ']
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
  data.meta.updatedLabel = `${y}.${m}.${d} (${days[kst.getUTCDay()]}) ${hh}:${mm} KST`;
  data.meta.sourceMode = okCount > 0 ? 'live' : 'snapshot';

  const serialized = JSON.stringify(data, null, 2);
  fs.writeFileSync(jsonPath, serialized, 'utf8');
  fs.writeFileSync(jsPath, `window.MARKET_DATA = ${serialized};\n`, 'utf8');
  console.log(`업데이트 완료: 성공 항목 ${okCount}개 (${data.meta.updatedLabel})`);
}

main();
