/**
 * 미국 ETF 신호등 — 토스증권 · 카카오 스타일 16종 ETF 의사결정 대시보드
 */
(() => {
  'use strict';

  const FAV_KEY = 'etf_pulse_favs_v1';
  const ETF_LOG_KEY = 'etf_pulse_buy_logs_v1';
  const FX_LOG_KEY = 'etf_pulse_fx_logs_v1';
  const LIVE_CACHE_KEY = 'etf_pulse_live_cache_v1';

  const loadJsonStorage = (key, fallback) => {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || 'null');
      return Array.isArray(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  };

  const state = {
    data: null,
    activeTab: 'dashboard',
    portfolioSub: 'analysis',
    selectedComboId: 'safe',
    comboBudgetKrw: 3000000,
    authorFilter: '전체',
    authorNick: window.SimpleShare ? window.SimpleShare.loadNickname() : '나',
    pendingShareData: null,
    category: '전체',
    lightFilter: 'all',
    searchQuery: '',
    sortBy: 'score',
    macroNewsFilter: 'all',
    selectedTicker: null,
    drawerNewsFilter: 'all',
    drawerChartRange: '1Y',
    favs: loadJsonStorage(FAV_KEY, ['SPLG', 'QQQM', 'SCHD', 'SGOV']),
    buyLogs: loadJsonStorage(ETF_LOG_KEY, []),
    fxLogs: loadJsonStorage(FX_LOG_KEY, [])
  };

  const saveBuyLogs = () => localStorage.setItem(ETF_LOG_KEY, JSON.stringify(state.buyLogs));
  const saveFxLogs = () => localStorage.setItem(FX_LOG_KEY, JSON.stringify(state.fxLogs));
  const todayStr = () => new Date().toISOString().slice(0, 10);

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const fmtUsd = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtKrw = (n) => `${Math.round(Number(n)).toLocaleString('ko-KR')}원`;
  const fmtPct = (n) => `${Number(n) > 0 ? '+' : ''}${Number(n).toFixed(2)}%`;

  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function categoryClass(cat) {
    if (cat === '대표지수') return 'cat-index';
    if (cat === '배당·인컴') return 'cat-div';
    if (cat === '기술·반도체') return 'cat-tech';
    if (cat === '레버리지') return 'cat-lev';
    return 'cat-safe';
  }

  function toggleFav(ticker) {
    const idx = state.favs.indexOf(ticker);
    if (idx >= 0) {
      state.favs.splice(idx, 1);
      showToast(`${ticker} 관심 종목에서 뺐어요.`);
    } else {
      state.favs.push(ticker);
      showToast(`${ticker} 관심 종목에 담았어요.`);
    }
    localStorage.setItem(FAV_KEY, JSON.stringify(state.favs));
    renderEtfList();
    updateDrawerFavBtn();
  }

  function updateDrawerFavBtn() {
    const btn = $('#drawerFavBtn');
    if (!btn || !state.selectedTicker) return;
    const isFav = state.favs.includes(state.selectedTicker);
    btn.textContent = isFav ? '★' : '☆';
    btn.style.color = isFav ? '#ff9f0a' : '';
    btn.setAttribute('aria-label', isFav ? '관심 종목 해제' : '관심 종목 추가');
  }

  function renderTrafficMini(light, opts = {}) {
    const cls = ['tl-mini'];
    if (opts.vertical) cls.push('vertical');
    if (opts.large) cls.push('lg');
    return `
      <span class="${cls.join(' ')}" aria-label="신호등 ${light === 'green' ? '초록' : light === 'yellow' ? '노랑' : '빨강'}">
        <i class="red ${light === 'red' ? 'on' : ''}"></i>
        <i class="yellow ${light === 'yellow' ? 'on' : ''}"></i>
        <i class="green ${light === 'green' ? 'on' : ''}"></i>
      </span>
    `;
  }

  function renderRiskBars(level = 2) {
    const lv = Math.max(1, Math.min(5, Number(level) || 2));
    const labels = ['', '매우 낮음', '보통', '다소 높음', '높음', '초고위험'];
    const color = lv <= 2 ? 'var(--green-dot)' : lv === 3 ? 'var(--yellow-dot)' : 'var(--red-dot)';
    let bars = '';
    for (let i = 1; i <= 5; i++) {
      bars += `<span class="rbar" style="background:${i <= lv ? color : 'var(--divider)'}"></span>`;
    }
    return `<span class="risk-wrap"><span class="risk-bars">${bars}</span><span>${labels[lv]}</span></span>`;
  }

  function sentimentMeta(s) {
    if (s === 'positive') return { cls: 'green', label: '호재' };
    if (s === 'negative') return { cls: 'red', label: '악재' };
    return { cls: 'yellow', label: '중립' };
  }

  // 기사별 3포인트 인앱 요약본 생성 (데이터에 digest가 있으면 우선 사용, 없으면 자동 생성)
  function getNewsDigest(n, fallbackTicker = '') {
    if (n.digest && n.digest.what) return n.digest;
    const etfText = (n.affectedEtfs && n.affectedEtfs.length) ? n.affectedEtfs.join('·') : (fallbackTicker || '미국 주요 ETF');
    const what = `${n.title} — ${n.summary || '관련 시장 흐름을 요약한 소식입니다.'}`;
    const impact =
      n.sentiment === 'positive'
        ? `${etfText}의 수급·실적 기대감을 높여주는 우호적 재료입니다.`
        : n.sentiment === 'negative'
          ? `단기 변동성을 키우거나 ${etfText}에 부담을 줄 수 있는 리스크 요인입니다.`
          : `${etfText}의 단기 방향성과 섹터 흐름을 점검할 참고 이슈입니다.`;
    const action =
      n.sentiment === 'negative'
        ? '이슈가 진정될 때까지 일괄 매수 대신 분할 매수·현금 비중 유지로 대응하세요.'
        : n.sentiment === 'positive'
          ? '기존 적립식 전략을 유지하되, 단기 과열(RSI 70↑) 여부만 함께 확인하세요.'
          : '다른 핵심 지표(환율·VIX)와 함께 보며 무리한 추격 매수는 피하세요.';
    return { what, impact, action };
  }

  function showToast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => el.classList.remove('show'), 2800);
  }

  // ==================== 인터랙티브 SVG 라인 차트 ====================
  function mountLineChart(containerEl, points, opts = {}) {
    if (!containerEl || !points || points.length < 2) return;
    const valueKey = opts.valueKey || 'close';
    const maKey = opts.maKey || null;
    const prefix = opts.prefix !== undefined ? opts.prefix : '$';
    const suffix = opts.suffix !== undefined ? opts.suffix : '';
    const color = opts.color || '#3182f6';

    const vals = points.map((p) => Number(p[valueKey]));
    const maVals = maKey ? points.map((p) => Number(p[maKey])).filter((v) => !Number.isNaN(v)) : [];
    const all = [...vals, ...maVals];
    const min = Math.min(...all) * 0.992;
    const max = Math.max(...all) * 1.008;
    const span = max - min || 1;

    const W = 520;
    const H = 180;
    const padL = suffix === '원' ? 56 : 48;
    const padR = 12;
    const padT = 12;
    const padB = 24;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const gx = (i) => padL + (i / (points.length - 1)) * plotW;
    const gy = (v) => padT + (1 - (v - min) / span) * plotH;

    const linePts = points.map((p, i) => `${gx(i).toFixed(1)},${gy(p[valueKey]).toFixed(1)}`);
    const areaD = `M ${gx(0).toFixed(1)},${(padT + plotH).toFixed(1)} L ${linePts.join(' L ')} L ${gx(points.length - 1).toFixed(1)},${(padT + plotH).toFixed(1)} Z`;

    let maSvg = '';
    if (maKey && maVals.length === points.length) {
      const maPts = points.map((p, i) => `${gx(i).toFixed(1)},${gy(p[maKey]).toFixed(1)}`).join(' ');
      maSvg = `<polyline fill="none" stroke="#94a3b8" stroke-width="1.4" stroke-dasharray="4 4" points="${maPts}" />`;
    }

    let gridSvg = '';
    for (let g = 0; g <= 2; g++) {
      const ratio = g / 2;
      const y = padT + ratio * plotH;
      const lv = max - ratio * span;
      gridSvg += `
        <line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" stroke="currentColor" stroke-opacity="0.08" stroke-width="1" />
        <text x="${padL - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" fill="#8b95a1" font-size="10.5">${prefix}${lv.toFixed(lv >= 100 ? 0 : 1)}${suffix}</text>
      `;
    }

    const mid = Math.floor(points.length / 2);
    const xSvg = [
      { idx: 0, anchor: 'start' },
      { idx: mid, anchor: 'middle' },
      { idx: points.length - 1, anchor: 'end' }
    ]
      .map(({ idx, anchor }) => `<text x="${gx(idx).toFixed(1)}" y="${H - 5}" text-anchor="${anchor}" fill="#8b95a1" font-size="10.5">${points[idx].date.slice(2)}</text>`)
      .join('');

    const gid = `g_${Math.random().toString(36).slice(2, 8)}`;
    containerEl.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" style="display:block; touch-action:pan-y;">
        <defs>
          <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${color}" stop-opacity="0.16" />
            <stop offset="100%" stop-color="${color}" stop-opacity="0.0" />
          </linearGradient>
        </defs>
        ${gridSvg}
        <path d="${areaD}" fill="url(#${gid})" />
        ${maSvg}
        <polyline fill="none" stroke="${color}" stroke-width="2.3" stroke-linejoin="round" stroke-linecap="round" points="${linePts.join(' ')}" />
        <line class="h-line" x1="0" y1="${padT}" x2="0" y2="${padT + plotH}" stroke="#8b95a1" stroke-dasharray="3 3" style="display:none;" />
        <circle class="h-dot" cx="0" cy="0" r="4.5" fill="${color}" stroke="#fff" stroke-width="2" style="display:none;" />
        ${xSvg}
      </svg>
      <div class="chart-tooltip"></div>
    `;

    const svg = $('svg', containerEl);
    const hLine = $('.h-line', svg);
    const hDot = $('.h-dot', svg);
    const tip = $('.chart-tooltip', containerEl);

    const onMove = (clientX) => {
      const rect = svg.getBoundingClientRect();
      const relX = ((clientX - rect.left) / rect.width) * W;
      const ratio = Math.max(0, Math.min(1, (relX - padL) / plotW));
      const idx = Math.round(ratio * (points.length - 1));
      const pt = points[idx];
      const cx = gx(idx);
      const cy = gy(pt[valueKey]);

      hLine.setAttribute('x1', cx);
      hLine.setAttribute('x2', cx);
      hLine.style.display = 'block';
      hDot.setAttribute('cx', cx);
      hDot.setAttribute('cy', cy);
      hDot.style.display = 'block';

      tip.innerHTML = `${pt.date} · <strong>${prefix}${Number(pt[valueKey]).toLocaleString('ko-KR')}${suffix}</strong>`;
      tip.style.display = 'block';
      const pxX = (cx / W) * rect.width;
      const pxY = (cy / H) * rect.height;
      const leftSide = pxX > rect.width * 0.6;
      tip.style.left = `${leftSide ? Math.max(4, pxX - tip.offsetWidth - 10) : pxX + 10}px`;
      tip.style.top = `${Math.max(2, pxY - 22)}px`;
    };

    const onLeave = () => {
      hLine.style.display = 'none';
      hDot.style.display = 'none';
      tip.style.display = 'none';
    };

    svg.addEventListener('mousemove', (e) => onMove(e.clientX));
    svg.addEventListener('mouseleave', onLeave);
    svg.addEventListener('touchmove', (e) => {
      if (e.touches[0]) onMove(e.touches[0].clientX);
    }, { passive: true });
    svg.addEventListener('touchend', onLeave);
  }

  // ==================== 데일리 브리핑용 미니 SVG 시각화 헬퍼 ====================
  // 1) 기준선(평균/목표) 포함 미니 스파크라인 SVG
  function renderMiniTrendSvg(values, refVal, strokeColor, refLabel) {
    if (!values || values.length < 2) return '';
    const all = refVal != null ? [...values, refVal] : values;
    const min = Math.min(...all);
    const max = Math.max(...all);
    const pad = (max - min || 1) * 0.16;
    const lo = min - pad;
    const hi = max + pad;
    const span = hi - lo || 1;
    const W = 220;
    const H = 56;
    const gx = (i) => 6 + (i / (values.length - 1)) * (W - 14);
    const gy = (v) => 8 + (1 - (v - lo) / span) * (H - 16);

    const pts = values.map((v, i) => `${gx(i).toFixed(1)},${gy(v).toFixed(1)}`);
    const area = `M ${gx(0).toFixed(1)},${H - 4} L ${pts.join(' L ')} L ${gx(values.length - 1).toFixed(1)},${H - 4} Z`;
    const lastX = gx(values.length - 1).toFixed(1);
    const lastY = gy(values[values.length - 1]).toFixed(1);
    const gid = `mt_${Math.random().toString(36).slice(2, 8)}`;

    let refSvg = '';
    if (refVal != null) {
      const ry = gy(refVal).toFixed(1);
      refSvg = `
        <line x1="4" y1="${ry}" x2="${W - 4}" y2="${ry}" stroke="#3182f6" stroke-width="1.2" stroke-dasharray="3 3" stroke-opacity="0.75" />
        ${refLabel ? `<text x="${W - 6}" y="${Math.max(10, Number(ry) - 3)}" text-anchor="end" fill="#3182f6" font-size="9.5" font-weight="700">${esc(refLabel)}</text>` : ''}
      `;
    }

    return `
      <svg class="mini-viz-svg" viewBox="0 0 ${W} ${H}" width="100%" height="56" aria-hidden="true">
        <defs>
          <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${strokeColor}" stop-opacity="0.22" />
            <stop offset="100%" stop-color="${strokeColor}" stop-opacity="0.01" />
          </linearGradient>
        </defs>
        <path d="${area}" fill="url(#${gid})" />
        ${refSvg}
        <polyline fill="none" stroke="${strokeColor}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" points="${pts.join(' ')}" />
        <circle cx="${lastX}" cy="${lastY}" r="4" fill="${strokeColor}" stroke="var(--surface)" stroke-width="2" />
      </svg>
    `;
  }

  // 2) 공포·탐욕 반원형 계기판 SVG (0=극단 공포 ~ 100=극단 탐욕)
  function renderFearGreedGaugeSvg(score) {
    const val = Math.max(0, Math.min(100, Number(score) || 50));
    const W = 220;
    const H = 84;
    const cx = 110;
    const cy = 68;
    const r = 54;
    const angleRad = Math.PI * (1 - val / 100);
    const px = cx + r * Math.cos(angleRad);
    const py = cy - r * Math.sin(angleRad);

    const arcPath = (startPct, endPct) => {
      const a1 = Math.PI * (1 - startPct / 100);
      const a2 = Math.PI * (1 - endPct / 100);
      const x1 = cx + r * Math.cos(a1);
      const y1 = cy - r * Math.sin(a1);
      const x2 = cx + r * Math.cos(a2);
      const y2 = cy - r * Math.sin(a2);
      return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
    };

    const label = val <= 25 ? '극단 공포' : val <= 45 ? '공포' : val <= 55 ? '중립' : val <= 75 ? '탐욕' : '극단 탐욕';
    const valColor = val <= 25 ? '#f04452' : val <= 45 ? '#ff9f0a' : val <= 55 ? '#64748b' : '#00c471';

    return `
      <svg class="mini-viz-svg" viewBox="0 0 ${W} ${H}" width="100%" height="82" aria-hidden="true">
        <path d="${arcPath(0, 28)}" fill="none" stroke="#f04452" stroke-width="10" stroke-linecap="round" opacity="0.88" />
        <path d="${arcPath(31, 69)}" fill="none" stroke="#ff9f0a" stroke-width="10" stroke-linecap="round" opacity="0.65" />
        <path d="${arcPath(72, 100)}" fill="none" stroke="#00c471" stroke-width="10" stroke-linecap="round" opacity="0.88" />
        <circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="7" fill="${valColor}" stroke="#fff" stroke-width="2.5" />
        <text x="${cx}" y="${cy - 18}" text-anchor="middle" fill="${valColor}" font-size="20" font-weight="800">${val}</text>
        <text x="${cx}" y="${cy - 2}" text-anchor="middle" fill="var(--ink-2)" font-size="10.5" font-weight="700">${label}</text>
        <text x="44" y="${H - 1}" text-anchor="middle" fill="var(--ink-3)" font-size="9.5">0 공포</text>
        <text x="176" y="${H - 1}" text-anchor="middle" fill="var(--ink-3)" font-size="9.5">100 탐욕</text>
      </svg>
    `;
  }

  // ==================== 1. 오늘의 결론 & 시각화 데일리 브리핑 ====================
  function renderOverview() {
    const { meta, overview, fx, macro } = state.data;
    $('#updatedLabel').textContent = meta.updatedLabel;
    $('#sourceModeBadge').textContent = meta.sourceMode === 'live' ? '실시간 반영됨' : '데일리 브리핑';
    $('#heroHeadline').textContent = overview.headline || '분할 매수 · 방어 우선';
    const subEl = $('#heroSubline');
    if (subEl) subEl.textContent = overview.subHeadline || '환율은 유리, 증시는 불안. 우량·배당부터 나눠 담으세요.';

    const cpiInd = macro.indicators.find((i) => i.id === 'cpi');
    const gdpInd = macro.indicators.find((i) => i.id === 'gdp');
    const vixInd = macro.indicators.find((i) => i.id === 'vix');

    // 1) 환율 시각화 데이터
    const fxVals = (fx.history || []).map((p) => Number(p.value));
    const fxAvg = fxVals.length ? +(fxVals.reduce((a, b) => a + b, 0) / fxVals.length).toFixed(1) : fx.ma60;
    const fxFromHigh = +(fx.usdKrw - fx.high52w).toFixed(1);
    const fxStroke = fx.light === 'green' ? '#00c471' : fx.light === 'yellow' ? '#ff9f0a' : '#f04452';

    // 2) 시장 심리(공포지수 + VIX) 시각화 데이터
    const fgVal = overview.marketSentiment.fearGreed;
    const vixCur = Number(overview.marketSentiment.vix) || 20;
    const vixPrev = vixInd ? Number(vixInd.prev) : 24.6;
    const vixDiff = +(vixCur - vixPrev).toFixed(1);
    const vixBarPct = Math.min(100, Math.round((vixCur / 40) * 100)); // 0~40 스케일, 20이 50%

    // 3) 미국 경기(물가 CPI 추이 + 목표 2% 비교 막대)
    const cpiVals = (cpiInd?.history || []).map((p) => Number(p.value));
    const cpiNum = Number(cpiInd?.numValue) || 3.8;
    const gdpNum = Number(gdpInd?.numValue) || 4.3;
    const cpiBarPct = Math.min(100, Math.round((cpiNum / 6) * 100)); // 0~6% 스케일, 2%가 33%
    const gdpBarPct = Math.min(100, Math.round((gdpNum / 6) * 100));

    $('#overviewSignals').innerHTML = `
      <!-- 카드 1: 환전 타이밍 (1년 추이 + 최저~최고 위치 바) -->
      <button class="logic-cell viz-card" type="button" data-goto="fx">
        <div class="logic-top">
          <span class="logic-label">1. 환전 (원/달러)</span>
          <span class="status-pill ${overview.fxSignal.light}"><i class="sdot ${overview.fxSignal.light}"></i>${esc(overview.fxSignal.label)}</span>
        </div>
        <div class="viz-val-row num">
          <span class="logic-val">${fx.usdKrw.toLocaleString('ko-KR')}원</span>
          <span class="viz-delta ${fxFromHigh <= 0 ? 'good' : 'bad'}">고점비 ${fxFromHigh}원</span>
        </div>
        <div class="viz-chart-box">
          ${renderMiniTrendSvg(fxVals, fxAvg, fxStroke, `1년평균 ${Math.round(fxAvg)}`)}
        </div>
        <div class="mini-range-wrap num">
          <div class="mini-range-bar">
            <div class="mini-range-fill" style="width:${fx.percentile1Y}%; background:${fxStroke};"></div>
            <div class="mini-range-dot" style="left:${fx.percentile1Y}%;"></div>
          </div>
          <div class="mini-range-labels">
            <span>최저 ${Math.round(fx.low52w)}</span>
            <strong>하위 ${fx.percentile1Y}% (싼 편)</strong>
            <span>최고 ${Math.round(fx.high52w)}</span>
          </div>
        </div>
      </button>

      <!-- 카드 2: 시장 심리 (반원 계기판 + VIX 변동성 막대) -->
      <button class="logic-cell viz-card" type="button" data-goto="macro-vix">
        <div class="logic-top">
          <span class="logic-label">2. 시장 심리</span>
          <span class="status-pill ${overview.marketSentiment.light}"><i class="sdot ${overview.marketSentiment.light}"></i>${esc(overview.marketSentiment.label)}</span>
        </div>
        <div class="viz-gauge-box">
          ${renderFearGreedGaugeSvg(fgVal)}
        </div>
        <div class="vix-compare num">
          <div class="vix-compare-head">
            <span>공포지수 VIX <strong>${vixCur}</strong></span>
            <span class="${vixDiff > 0 ? 'bad' : 'good'}">${vixDiff > 0 ? '+' : ''}${vixDiff} (경계 20↑)</span>
          </div>
          <div class="ref-bar-track">
            <div class="ref-bar-fill" style="width:${vixBarPct}%; background:${vixCur >= 25 ? '#f04452' : vixCur >= 18 ? '#ff9f0a' : '#00c471'};"></div>
            <div class="ref-bar-tick" style="left:50%;" title="경계선 20"></div>
          </div>
        </div>
      </button>

      <!-- 카드 3: 미국 경기 (물가 추이 + 목표 2% 대비 비교 막대) -->
      <button class="logic-cell viz-card" type="button" data-goto="macro">
        <div class="logic-top">
          <span class="logic-label">3. 미국 경기</span>
          <span class="status-pill ${overview.macroSignal.light}"><i class="sdot ${overview.macroSignal.light}"></i>${esc(overview.macroSignal.label)}</span>
        </div>
        <div class="viz-val-row num">
          <span class="logic-val">물가 ${cpiNum}%</span>
          <span class="viz-delta bad">목표(2%) 대비 +${(cpiNum - 2).toFixed(1)}%p</span>
        </div>
        <div class="viz-chart-box">
          ${renderMiniTrendSvg(cpiVals, 2.0, '#f04452', '목표 2.0%')}
        </div>
        <div class="dual-bars num">
          <div class="dual-bar-row">
            <span>물가 <strong>${cpiNum}%</strong></span>
            <div class="ref-bar-track">
              <div class="ref-bar-fill" style="width:${cpiBarPct}%; background:#f04452;"></div>
              <div class="ref-bar-tick" style="left:33.3%;" title="목표 2%"></div>
            </div>
            <em class="bad">높음</em>
          </div>
          <div class="dual-bar-row">
            <span>성장 <strong>${gdpNum}%</strong></span>
            <div class="ref-bar-track">
              <div class="ref-bar-fill" style="width:${gdpBarPct}%; background:#00c471;"></div>
              <div class="ref-bar-tick" style="left:33.3%;" title="잠재 2%"></div>
            </div>
            <em class="good">탄탄</em>
          </div>
        </div>
      </button>
    `;

    $$('.logic-cell').forEach((btn) => {
      btn.addEventListener('click', () => {
        const t = btn.dataset.goto;
        if (t === 'macro-vix') location.href = './macro.html?id=vix&from=dashboard';
        else if (t && t !== 'dashboard') switchTab(t);
      });
    });

    // 핵심 행동 3줄 (짧고 명확하게 + 종목 바로가기)
    const actions = overview.todayActions || [
      { tag: '환전', light: 'green', text: '1,343원 · 분할 환전 유리', tickers: ['SGOV'] },
      { tag: '매수', light: 'green', text: '우량·배당 중심 나눠 담기', tickers: ['SPLG', 'SCHD', 'VT'] },
      { tag: '주의', light: 'red', text: '3배 레버리지 추격 금지', tickers: ['SOXL', 'TQQQ', 'NRGU'] }
    ];
    const actEl = $('#todayActionList');
    if (actEl) {
      actEl.innerHTML = actions
        .map(
          (a) => `
        <div class="today-action-row">
          <div class="ta-left">
            <span class="status-pill ${a.light}"><i class="sdot ${a.light}"></i>${esc(a.tag)}</span>
            <span class="ta-text">${esc(a.text)}</span>
          </div>
          <div class="ta-chips">
            ${(a.tickers || []).map((tk) => `<button class="etf-chip ${a.light === 'red' ? 'red-chip' : ''}" type="button" data-quick-etf="${tk}">${tk}</button>`).join('')}
          </div>
        </div>
      `
        )
        .join('');

      $$('[data-quick-etf]', actEl).forEach((btn) => {
        btn.addEventListener('click', () => openEtfDrawer(btn.dataset.quickEtf));
      });
    }
  }

  // ==================== 1-2. 추천 ETF & 성향별 포트폴리오 조합 (내 투자 > 추천 조합 탭) ====================
  function renderRecommendationsInto(containerEl) {
    const rec = state.data.overview?.recommendations;
    if (!rec || !containerEl) return;

    const fxRate = state.data.fx.usdKrw;
    const etfMap = new Map(state.data.etfs.map((e) => [e.ticker, e]));
    const portfolios = rec.portfolios || [];
    const active = portfolios.find((p) => p.id === state.selectedComboId) || portfolios[0];
    if (!active) return;

    const colors = ['#3182f6', '#00c471', '#ff9f0a', '#8b5cf6', '#f04452'];
    const budget = Math.max(0, Number(state.comboBudgetKrw) || 0);

    containerEl.innerHTML = `
      <div class="surface">
        <div class="list-header" style="margin-bottom:14px;">
          <div>
            <h2 class="section-title">지금 장세 추천 ETF TOP 3</h2>
            <p class="section-sub">환율·금리·유가를 고려해 지금 가장 무난한 핵심 종목 3가지예요</p>
          </div>
        </div>
        <div class="top-picks-grid" style="margin-bottom:0;">
          ${(rec.topPicks || [])
            .map((p, idx) => {
              const e = etfMap.get(p.ticker);
              return `
              <button class="top-pick-card" type="button" data-rec-etf="${p.ticker}">
                <div class="tp-head">
                  <span class="tp-rank">추천 ${idx + 1}</span>
                  <span class="status-pill green">${esc(p.role)}</span>
                </div>
                <div class="tp-main num">
                  <strong>${p.ticker}</strong>
                  <span>${e ? fmtUsd(e.price) : ''}</span>
                </div>
                <div class="tp-name">${e ? esc(e.krName) : ''}</div>
                <p class="tp-reason">${esc(p.reason)}</p>
              </button>
            `;
            })
            .join('')}
        </div>
      </div>

      <div class="surface">
        <div class="combo-head">
          <div>
            <h2 class="section-title">성향별 추천 운용 조합</h2>
            <p class="section-sub">투자 예산을 입력하면 종목별 매수 금액이 자동으로 계산됩니다</p>
          </div>
          <div class="signal-seg" id="comboTabBtns">
            ${portfolios
              .map(
                (p) => `<button class="seg-btn ${p.id === active.id ? 'active' : ''}" type="button" data-combo="${p.id}">${esc(p.name.split('·')[0].trim())}</button>`
              )
              .join('')}
          </div>
        </div>

        <div class="combo-box" style="margin-top:12px;">
          <div class="combo-meta-row">
            <span class="status-pill ${active.light}"><i class="sdot ${active.light}"></i>${esc(active.name)}</span>
            <span class="news-meta">예상 배당 <strong>${esc(active.expectedYield)}</strong> · 위험도 <strong>${esc(active.riskText)}</strong></span>
          </div>
          <p class="combo-desc">${esc(active.summary)}</p>

          <div class="alloc-bar">
            ${active.allocations.map((a, i) => `<div style="width:${a.pct}%; background:${colors[i % colors.length]};"></div>`).join('')}
          </div>

          <div class="combo-budget-row">
            <label for="comboBudgetInput">내 투자 예산 (원)</label>
            <input type="number" id="comboBudgetInput" step="any" min="100000" value="${budget}" />
          </div>

          <div class="combo-alloc-list num" id="comboAllocList"></div>
        </div>
      </div>
    `;

    $$('[data-rec-etf]', containerEl).forEach((b) => {
      b.addEventListener('click', () => openEtfDrawer(b.dataset.recEtf));
    });

    const renderAllocRows = (krwBudget) => {
      $('#comboAllocList', containerEl).innerHTML = active.allocations
        .map((a, i) => {
          const e = etfMap.get(a.ticker);
          const allocKrw = Math.round((krwBudget * a.pct) / 100);
          const shares = e ? allocKrw / fxRate / e.price : 0;
          return `
          <div class="combo-alloc-row" data-combo-etf="${a.ticker}" role="button" tabindex="0">
            <div style="display:flex; align-items:center; gap:8px; min-width:0;">
              <i class="sdot" style="background:${colors[i % colors.length]};"></i>
              <strong>${a.ticker}</strong>
              <span class="news-meta">${esc(a.role)}</span>
            </div>
            <div style="text-align:right; flex-shrink:0;">
              <strong>${a.pct}%</strong>
              <span class="news-meta"> · ${fmtKrw(allocKrw)}${e ? ` (약 ${shares.toFixed(1)}주)` : ''}</span>
            </div>
          </div>
        `;
        })
        .join('');

      $$('[data-combo-etf]', containerEl).forEach((el) => {
        el.addEventListener('click', () => openEtfDrawer(el.dataset.comboEtf));
      });
    };

    renderAllocRows(budget);

    $('#comboBudgetInput', containerEl).addEventListener('input', (ev) => {
      state.comboBudgetKrw = Number(ev.target.value) || 0;
      renderAllocRows(state.comboBudgetKrw);
    });

    $$('#comboTabBtns .seg-btn', containerEl).forEach((btn) => {
      btn.addEventListener('click', () => {
        state.selectedComboId = btn.dataset.combo;
        renderRecommendationsInto(containerEl);
      });
    });
  }

  // ==================== 2. 16종 ETF 리스트 (관심 ★ + 신호등) ====================
  function getFilteredEtfs() {
    const q = state.searchQuery.trim().toLowerCase();
    let list = [...state.data.etfs];
    if (state.category === '관심') list = list.filter((e) => state.favs.includes(e.ticker));
    else if (state.category !== '전체') list = list.filter((e) => e.category === state.category);

    if (state.lightFilter !== 'all') list = list.filter((e) => e.light === state.lightFilter);
    if (q) {
      list = list.filter(
        (e) =>
          e.ticker.toLowerCase().includes(q) ||
          e.krName.toLowerCase().includes(q) ||
          e.name.toLowerCase().includes(q) ||
          e.category.toLowerCase().includes(q)
      );
    }

    const posCnt = (e) => e.news.filter((n) => n.sentiment === 'positive').length;
    const yld = (e) => parseFloat(String(e.dividendYield).replace('%', '')) || 0;

    list.sort((a, b) => {
      if (state.sortBy === 'flowBuy') return (b.flowScore || 0) - (a.flowScore || 0);
      if (state.sortBy === 'flowSell') return (a.flowScore || 0) - (b.flowScore || 0);
      if (state.sortBy === 'mdd') return a.mddFromHigh - b.mddFromHigh;
      if (state.sortBy === 'news') return posCnt(b) - posCnt(a);
      if (state.sortBy === 'yield') return yld(b) - yld(a);
      if (state.sortBy === 'change') return b.changePct - a.changePct;
      return b.score - a.score;
    });
    return list;
  }

  function renderEtfList() {
    const listEl = $('#etfGrid');
    const fxRate = state.data.fx.usdKrw;
    const list = getFilteredEtfs();
    $('#etfCountLabel').textContent = list.length;

    if (!list.length) {
      listEl.innerHTML = `<div style="padding:36px 0; text-align:center; color:var(--ink-3); font-size:0.9rem;">${state.category === '관심' ? '관심 종목(☆)을 눌러 자주 보는 ETF를 담아보세요.' : '조건에 맞는 ETF가 없습니다.'}</div>`;
      return;
    }

    listEl.innerHTML = list
      .map((e) => {
        const up = e.changePct >= 0;
        const pos = e.news.filter((n) => n.sentiment === 'positive').length;
        const neg = e.news.filter((n) => n.sentiment === 'negative').length;
        const isFav = state.favs.includes(e.ticker);
        const fs = Number(e.flowScore) || 0;
        const flowCls = fs >= 20 ? 'up' : fs <= -20 ? 'down' : '';
        const flowTag = e.flowLabel || (fs >= 20 ? '순매수' : fs <= -20 ? '순매도' : '균형');
        return `
        <div class="etf-row" data-ticker="${e.ticker}" role="button" tabindex="0">
          <div class="etf-row-left">
            <button class="star-btn ${isFav ? 'active' : ''}" type="button" data-fav="${e.ticker}" aria-label="${e.ticker} 관심 종목">${isFav ? '★' : '☆'}</button>
            <div class="ticker-avatar ${categoryClass(e.category)}">${e.ticker}</div>
            <div class="etf-name-col">
              <div class="etf-name-top">
                <strong>${esc(e.krName)}</strong>
                <span class="etf-ticker-sub">${e.ticker}</span>
              </div>
              <div class="etf-meta-line">
                <span class="status-pill ${e.light} mobile-only-badge"><i class="sdot ${e.light}"></i>${esc(e.actionBadge)} ${e.score}</span>
                <span class="flow-mini ${flowCls}">${esc(flowTag)}</span>
                <span class="news-mini-stat">
                  <span><i class="sdot green"></i>호재 ${pos}</span>
                  <span><i class="sdot red"></i>악재 ${neg}</span>
                </span>
              </div>
            </div>
          </div>

          <div class="etf-row-mid">
            ${renderTrafficMini(e.light)}
            <span class="status-pill ${e.light}">${esc(e.actionBadge)} · ${e.score}점</span>
          </div>

          <div class="etf-row-right num">
            <span class="row-price">${fmtUsd(e.price)}</span>
            <span class="row-delta ${up ? 'up' : 'down'}">${fmtPct(e.changePct)}</span>
            <span class="row-krw">${fmtKrw(e.price * fxRate)}</span>
          </div>
        </div>
      `;
      })
      .join('');

    $$('.star-btn', listEl).forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        toggleFav(btn.dataset.fav);
      });
    });

    $$('.etf-row', listEl).forEach((row) => {
      const open = () => openEtfDrawer(row.dataset.ticker);
      row.addEventListener('click', open);
      row.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          open();
        }
      });
    });
  }

  // ==================== 3. ETF 상세 시트 (꼼꼼·간결 5가지 근거 + 전략) ====================
  function openEtfDrawer(ticker) {
    const etf = state.data.etfs.find((e) => e.ticker === ticker);
    if (!etf) return;
    state.selectedTicker = ticker;
    state.drawerNewsFilter = 'all';
    state.drawerChartRange = '1Y';

    $('#drawerTickerTitle').textContent = `${etf.ticker} · ${etf.krName}`;
    $('#drawerCategory').textContent = etf.category;
    updateDrawerFavBtn();

    renderDrawerContent(etf);
    $('#etfModalBackdrop').classList.add('open');
    $('#etfModalBackdrop').setAttribute('aria-hidden', 'false');
    $('#drawerBody').scrollTop = 0;
    requestAnimationFrame(() => { $('#drawerBody').scrollTop = 0; });
    document.body.style.overflow = 'hidden';
  }

  function closeEtfDrawer() {
    $('#drawerBody').scrollTop = 0;
    $('#etfModalBackdrop').classList.remove('open');
    $('#etfModalBackdrop').setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function renderDrawerContent(etf) {
    const fx = state.data.fx;
    const fxRate = fx.usdKrw;
    const up = etf.changePct >= 0;
    const pos = etf.news.filter((n) => n.sentiment === 'positive').length;
    const neg = etf.news.filter((n) => n.sentiment === 'negative').length;

    // 52주 저점~고점 중 현재 가격 위치(%)
    const rangeSpan = Math.max(0.01, etf.high52w - etf.low52w);
    const pos52w = Math.round(((etf.price - etf.low52w) / rangeSpan) * 100);

    // 5가지 객관적 판단 근거
    const priceStatus = etf.mddFromHigh <= -5 ? { l: 'green', t: '할인 구간' } : etf.riskLevel === 1 ? { l: 'green', t: '원금 안정' } : { l: 'yellow', t: '보통' };
    const rsiStatus = etf.rsi14 < 38 ? { l: 'green', t: '과매도' } : etf.rsi14 > 68 ? { l: 'red', t: '과열' } : { l: 'yellow', t: '중립' };
    const trendStatus = etf.ma200DiffPct >= 0 ? { l: 'green', t: '상승 추세' } : { l: 'red', t: '하락 이탈' };
    const fxStatus = fx.light === 'green' ? { l: 'green', t: '환전 유리' } : fx.light === 'yellow' ? { l: 'yellow', t: '보통' } : { l: 'red', t: '환율 부담' };
    const newsStatus = pos > neg ? { l: 'green', t: '호재 우세' } : neg > pos ? { l: 'red', t: '악재 우세' } : { l: 'yellow', t: '팽팽함' };

    // 매력적인 가격구간 시각화 바 계산
    const pz = etf.priceZones || {
      buyLow: +(etf.ma200 * 0.94).toFixed(2),
      buyHigh: +(etf.ma200 * 1.01).toFixed(2),
      fairHigh: +(etf.high52w * 0.97).toFixed(2),
      status: '적정 적립 구간',
      light: 'yellow',
      note: '정기 분할 매수에 무리 없는 구간'
    };
    const barMin = Math.min(etf.low52w, pz.buyLow) * 0.98;
    const barMax = Math.max(etf.high52w, pz.fairHigh) * 1.02;
    const barSpan = Math.max(0.01, barMax - barMin);
    const pctOf = (v) => Math.max(2, Math.min(98, ((v - barMin) / barSpan) * 100));
    const curPin = pctOf(etf.price);
    const greenEnd = pctOf(pz.buyHigh);
    const yellowEnd = Math.max(greenEnd + 6, pctOf(pz.fairHigh));

    const body = $('#drawerBody');
    body.innerHTML = `
      <!-- 1. 결론 + 실행 전략 3칸 + 매력적인 가격 구간 + 5가지 꼼꼼 체크 -->
      <div class="sheet-card">
        <div class="verdict-top">
          <div>
            <div class="verdict-price-row num">
              <span class="verdict-price">${fmtUsd(etf.price)}</span>
              <span class="row-delta ${up ? 'up' : 'down'}" style="font-size:0.95rem;">${fmtPct(etf.changePct)}</span>
            </div>
            <div class="verdict-krw num">약 ${fmtKrw(etf.price * fxRate)} · 1년 ${etf.return1Y >= 0 ? '+' : ''}${etf.return1Y}%</div>
          </div>
          ${renderTrafficMini(etf.light, { vertical: true, large: true })}
        </div>

        <div class="verdict-banner ${etf.light}">
          <div>
            <div class="verdict-banner-title">${esc(etf.actionBadge)} · 매력도 ${etf.score}점</div>
            <div class="verdict-banner-sub">${esc(etf.actionSummary)}</div>
          </div>
        </div>

        <!-- 매력적인 가격 구간 가이드 -->
        <div class="price-zone-card">
          <div class="pz-head">
            <strong>매력적인 가격 구간</strong>
            <span class="status-pill ${pz.light}"><i class="sdot ${pz.light}"></i>현재: ${esc(pz.status)}</span>
          </div>
          <div class="pz-bar-wrap">
            <div class="pz-bar">
              <div class="pz-seg green" style="width:${greenEnd}%"></div>
              <div class="pz-seg yellow" style="width:${Math.max(4, yellowEnd - greenEnd)}%"></div>
              <div class="pz-seg red" style="width:${Math.max(4, 100 - yellowEnd)}%"></div>
            </div>
            <div class="pz-pin" style="left:${curPin}%" title="현재가 ${fmtUsd(etf.price)}"></div>
          </div>
          <div class="pz-grid num">
            <div class="pz-box green">
              <span>적극 분할</span>
              <strong>${fmtUsd(pz.buyLow)} ~ ${fmtUsd(pz.buyHigh)}</strong>
            </div>
            <div class="pz-box yellow">
              <span>적정 적립</span>
              <strong>${fmtUsd(pz.buyHigh)} ~ ${fmtUsd(pz.fairHigh)}</strong>
            </div>
            <div class="pz-box red">
              <span>추격 주의</span>
              <strong>${fmtUsd(pz.fairHigh)} 이상</strong>
            </div>
          </div>
          <div class="pz-note">${esc(pz.note)}</div>
        </div>

        <!-- 의사결정 실행 가이드 3칸 -->
        <div class="decision-strip">
          <div class="dec-cell">
            <span>권장 전략</span>
            <strong>${esc(etf.strategy || '분할 매수')}</strong>
          </div>
          <div class="dec-cell">
            <span>1회 진입 비중</span>
            <strong>${esc(etf.entryRatio || '20~25%')}</strong>
          </div>
          <div class="dec-cell">
            <span>위험도</span>
            <strong>${renderRiskBars(etf.riskLevel)}</strong>
          </div>
        </div>

        <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;">
          <button class="primary-sm-btn" type="button" id="quickLogBuyBtn">+ 이 종목 매수 일지 기록</button>
        </div>

        ${etf.compareTip ? `<div class="compare-tip"><strong>선택 팁</strong><span>${esc(etf.compareTip)}</span></div>` : ''}

        <div class="explain-title" style="margin-top:16px;">왜 이 신호인가요? (6가지 핵심 체크)</div>
        <div class="explain-rows">
          <div class="explain-row">
            <div class="explain-left">
              <span class="explain-key">수급 흐름</span>
              <span class="explain-fact">${esc(etf.flowLabel || '매수·매도 균형')} (수급 지수 ${etf.flowScore > 0 ? '+' : ''}${etf.flowScore || 0})</span>
            </div>
            <span class="status-pill ${(etf.flowScore || 0) >= 20 ? 'green' : (etf.flowScore || 0) <= -20 ? 'red' : 'yellow'}">${(etf.flowScore || 0) >= 20 ? '매수 우위' : (etf.flowScore || 0) <= -20 ? '매도 우위' : '균형'}</span>
          </div>
          <div class="explain-row">
            <div class="explain-left">
              <span class="explain-key">가격 위치</span>
              <span class="explain-fact num">고점 대비 ${etf.mddFromHigh}% (52주 ${pos52w}% 위치)</span>
            </div>
            <span class="status-pill ${priceStatus.l}">${priceStatus.t}</span>
          </div>
          <div class="explain-row">
            <div class="explain-left">
              <span class="explain-key">과매도</span>
              <span class="explain-fact num">RSI ${etf.rsi14} (35↓ 과매도 · 70↑ 과열)</span>
            </div>
            <span class="status-pill ${rsiStatus.l}">${rsiStatus.t}</span>
          </div>
          <div class="explain-row">
            <div class="explain-left">
              <span class="explain-key">중기 추세</span>
              <span class="explain-fact num">200일선 ${etf.ma200DiffPct >= 0 ? '위' : '아래'} (${etf.ma200DiffPct >= 0 ? '+' : ''}${etf.ma200DiffPct}%)</span>
            </div>
            <span class="status-pill ${trendStatus.l}">${trendStatus.t}</span>
          </div>
          <div class="explain-row">
            <div class="explain-left">
              <span class="explain-key">환율 조건</span>
              <span class="explain-fact num">${fxRate.toLocaleString('ko-KR')}원 (1년 하위 ${fx.percentile1Y}%)</span>
            </div>
            <span class="status-pill ${fxStatus.l}">${fxStatus.t}</span>
          </div>
          <div class="explain-row">
            <div class="explain-left">
              <span class="explain-key">최근 뉴스</span>
              <span class="explain-fact">호재 ${pos}건 · 악재 ${neg}건</span>
            </div>
            <span class="status-pill ${newsStatus.l}">${newsStatus.t}</span>
          </div>
        </div>
      </div>

      <!-- 2. 주가 차트 & 핵심 3지표 -->
      <div class="sheet-card">
        <div class="chart-header">
          <strong style="font-size:0.95rem;">주가 흐름 <span style="font-size:0.76rem; font-weight:600; color:var(--ink-3);">· 200일선</span></strong>
          <div class="signal-seg" id="drawerRangeBtns">
            <button class="seg-btn ${state.drawerChartRange === '3M' ? 'active' : ''}" data-range="3M" type="button">3개월</button>
            <button class="seg-btn ${state.drawerChartRange === '6M' ? 'active' : ''}" data-range="6M" type="button">6개월</button>
            <button class="seg-btn ${state.drawerChartRange === '1Y' ? 'active' : ''}" data-range="1Y" type="button">1년</button>
          </div>
        </div>
        <div class="chart-stage" id="drawerChartStage"></div>
        <div class="kpi-trio num">
          <div class="kpi-item">
            <span>배당수익률</span>
            <strong>${etf.dividendYield}</strong>
          </div>
          <div class="kpi-item">
            <span>연 운용보수</span>
            <strong>${etf.expenseRatio}</strong>
          </div>
          <div class="kpi-item">
            <span>예상 PER</span>
            <strong>${etf.forwardPE}</strong>
          </div>
        </div>
      </div>

      <!-- 3. 호재 · 악재 & 관련 기사 -->
      <div class="sheet-card">
        <div class="list-header" style="margin-bottom:12px;">
          <strong style="font-size:0.96rem;">호재 · 악재와 관련 기사</strong>
          <div class="signal-seg" id="drawerNewsFilterBtns">
            <button class="seg-btn active" data-sent="all" type="button">전체</button>
            <button class="seg-btn" data-sent="positive" type="button"><i class="sdot green"></i>호재 ${pos}</button>
            <button class="seg-btn" data-sent="negative" type="button"><i class="sdot red"></i>악재 ${neg}</button>
          </div>
        </div>

        <div class="pros-cons">
          <div class="pc-box">
            <h4><i class="sdot green"></i> 긍정 요인 (호재)</h4>
            <ul>${etf.bullFactors.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
          </div>
          <div class="pc-box">
            <h4><i class="sdot red"></i> 주의 요인 (악재)</h4>
            <ul>${etf.bearFactors.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
          </div>
        </div>

        <div class="news-feed" id="drawerNewsList"></div>
      </div>

      <!-- 4. 접이식 원화 수익 계산기 -->
      <div class="sheet-card">
        <details class="sim-details">
          <summary>
            <span>내 원화로 사면 얼마 벌까? (환율 포함 계산기)</span>
            <span class="sim-arrow">열기 ▾</span>
          </summary>
          <div class="sim-body">
            <div class="sim-inputs">
              <div class="sim-field">
                <label for="simKrwInput">투자금 (원)</label>
                <input type="number" id="simKrwInput" value="3000000" step="100000" min="100000" />
              </div>
              <div class="sim-field">
                <label for="simPriceChgInput">주가 변동 (%)</label>
                <input type="number" id="simPriceChgInput" value="10" step="1" min="-80" max="300" />
              </div>
              <div class="sim-field">
                <label for="simTargetFxInput">예상 환율 (원)</label>
                <input type="number" id="simTargetFxInput" value="${Math.round(fxRate)}" step="10" min="900" max="2000" />
              </div>
            </div>
            <div class="sim-summary num" id="simResultBox"></div>
          </div>
        </details>
      </div>
    `;

    const quickLogBtn = $('#quickLogBuyBtn', body);
    if (quickLogBtn) {
      quickLogBtn.addEventListener('click', () => {
        closeEtfDrawer();
        state.portfolioSub = 'etflog';
        switchTab('portfolio');
        renderPortfolioTab(etf.ticker);
      });
    }

    const drawChart = () => {
      const len = etf.history.length;
      const take = state.drawerChartRange === '3M' ? Math.min(len, 7) : state.drawerChartRange === '6M' ? Math.min(len, 14) : len;
      const slice = etf.history.slice(-take);
      const isPositiveTrend = slice[slice.length - 1].close >= slice[0].close;
      mountLineChart($('#drawerChartStage', body), slice, {
        valueKey: 'close',
        maKey: 'ma200',
        prefix: '$',
        color: isPositiveTrend ? '#f04452' : '#3182f6'
      });
    };
    drawChart();

    $$('#drawerRangeBtns .seg-btn', body).forEach((btn) => {
      btn.addEventListener('click', () => {
        state.drawerChartRange = btn.dataset.range;
        $$('#drawerRangeBtns .seg-btn', body).forEach((b) => b.classList.toggle('active', b === btn));
        drawChart();
      });
    });

    const renderNews = () => {
      const list = state.drawerNewsFilter === 'all' ? etf.news : etf.news.filter((n) => n.sentiment === state.drawerNewsFilter);
      const wrap = $('#drawerNewsList', body);
      if (!list.length) {
        wrap.innerHTML = `<div style="padding:16px 0; text-align:center; color:var(--ink-3); font-size:0.84rem;">해당 분류의 기사가 없습니다.</div>`;
        return;
      }
      wrap.innerHTML = list
        .map((n, idx) => {
          const sm = sentimentMeta(n.sentiment);
          const src = String(n.source || '');
          const isGlobalWire = /^(bloomberg|reuters|wsj|cnbc|financial times|ft)$/i.test(src.trim());
          const d = getNewsDigest(n, etf.ticker);
          return `
          <details class="news-item news-digest-item" ${idx === 0 ? 'open' : ''}>
            <summary class="news-summary-trigger">
              <div class="news-top">
                <div style="display:flex; align-items:center; gap:6px;">
                  <span class="status-pill ${sm.cls}"><i class="sdot ${sm.cls}"></i>${sm.label}</span>
                  ${isGlobalWire ? `<span class="bb-badge">${esc(src)}</span>` : ''}
                </div>
                <span class="news-meta">${esc(src)} · ${esc(n.publishedAt)}</span>
              </div>
              <div class="news-head-row">
                <h4 class="news-title">${esc(n.title)}</h4>
                <span class="news-chev" aria-hidden="true">▾</span>
              </div>
              <p class="news-impact">${esc(n.summary)}</p>
            </summary>
            <div class="digest-panel">
              <div class="digest-row"><strong>핵심</strong><span>${esc(d.what)}</span></div>
              <div class="digest-row"><strong>영향</strong><span>${esc(d.impact)}</span></div>
              <div class="digest-row"><strong>대응</strong><span>${esc(d.action)}</span></div>
            </div>
          </details>
        `;
        })
        .join('');
    };
    renderNews();

    $$('#drawerNewsFilterBtns .seg-btn', body).forEach((btn) => {
      btn.addEventListener('click', () => {
        state.drawerNewsFilter = btn.dataset.sent;
        $$('#drawerNewsFilterBtns .seg-btn', body).forEach((b) => b.classList.toggle('active', b === btn));
        renderNews();
      });
    });

    const calcSim = () => {
      const krw = Math.max(0, Number($('#simKrwInput', body).value) || 0);
      const chg = Number($('#simPriceChgInput', body).value) || 0;
      const tfx = Math.max(500, Number($('#simTargetFxInput', body).value) || fxRate);
      const shares = krw / fxRate / etf.price;
      const futureKrw = shares * etf.price * (1 + chg / 100) * tfx;
      const profit = futureKrw - krw;
      const retPct = krw > 0 ? (profit / krw) * 100 : 0;

      $('#simResultBox', body).innerHTML = `
        <div>
          <div style="font-size:0.75rem; color:var(--ink-3);">예상 평가금액 (${shares.toFixed(2)}주)</div>
          <div style="font-size:1.15rem; font-weight:800;">${fmtKrw(futureKrw)}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:0.75rem; color:var(--ink-3);">환율 포함 예상 손익</div>
          <div style="font-size:1.05rem; font-weight:800; color:${retPct >= 0 ? 'var(--up)' : 'var(--down)'}">
            ${profit >= 0 ? '+' : ''}${fmtKrw(profit)} (${fmtPct(retPct)})
          </div>
        </div>
      `;
    };
    calcSim();
    ['#simKrwInput', '#simPriceChgInput', '#simTargetFxInput'].forEach((id) => {
      $(id, body).addEventListener('input', calcSim);
    });
  }

  // ==================== 4. 환전 타이밍 탭 ====================
  function renderFxTab() {
    const fx = state.data.fx;
    const up = fx.changePct >= 0;
    const wrap = $('#fxContainer');

    wrap.innerHTML = `
      <div class="fx-stack">
        <div class="surface">
          <div class="hero-eyebrow">
            <span class="eyebrow-text">원/달러 환전 타이밍</span>
            <span class="status-pill ${fx.light}"><i class="sdot ${fx.light}"></i>${fx.light === 'green' ? '환전 유리' : fx.light === 'yellow' ? '분할 환전' : '환율 부담'}</span>
          </div>
          <div style="display:flex; align-items:baseline; gap:10px; flex-wrap:wrap;">
            <span class="fx-rate-big num">${fx.usdKrw.toLocaleString('ko-KR')}원</span>
            <span class="row-delta num ${up ? 'up' : 'down'}" style="font-size:0.95rem;">${fmtPct(fx.changePct)}</span>
          </div>
          <p class="section-sub" style="margin:6px 0 0; font-size:0.9rem; color:var(--ink-2);">${esc(fx.recommendation)}</p>

          <div class="range-bar">
            <div class="range-thumb" style="left:${fx.percentile1Y}%"></div>
          </div>
          <div class="range-labels num">
            <span>1년 최저 ${fx.low52w}원</span>
            <strong>현재 하위 ${fx.percentile1Y}%</strong>
            <span>1년 최고 ${fx.high52w}원</span>
          </div>

          <div class="chart-stage" id="fxChartStage" style="margin-top:18px;"></div>

          <div class="kpi-trio num">
            <div class="kpi-item">
              <span>20일 평균</span>
              <strong>${fx.ma20.toLocaleString('ko-KR')}원</strong>
            </div>
            <div class="kpi-item">
              <span>달러 인덱스(DXY)</span>
              <strong>${fx.dxy}</strong>
            </div>
            <div class="kpi-item">
              <span>한미 금리차</span>
              <strong>${fx.krUsRateGap}%p</strong>
            </div>
          </div>
        </div>

        <div class="surface">
          <div class="list-header" style="margin-bottom:12px;">
            <div>
              <h2 class="section-title">구간별 분할 환전 기준</h2>
              <p class="section-sub">환율 구간에 따라 나눠 바꾸면 평균 단가가 안정돼요</p>
            </div>
          </div>
          <div class="plan-list">
            ${fx.plan
              .map(
                (p) => `
              <div class="plan-row ${p.status === '현재 구간' ? 'active' : ''}">
                <div>
                  <strong style="font-size:0.92rem;">${esc(p.zone)}</strong>
                  <div style="font-size:0.8rem; color:var(--ink-2); margin-top:2px;">${esc(p.desc)}</div>
                </div>
                <div style="text-align:right; flex-shrink:0;">
                  <strong class="num" style="font-size:1rem; color:var(--blue);">${esc(p.ratio)}</strong>
                  <div style="font-size:0.74rem; color:var(--ink-3);">${esc(p.status)}</div>
                </div>
              </div>
            `
              )
              .join('')}
          </div>
        </div>

        <div class="surface">
          <div class="list-header" style="margin-bottom:12px;">
            <h2 class="section-title">빠른 환전 계산기</h2>
          </div>
          <div class="sim-field" style="margin-bottom:12px;">
            <label for="quickFxKrw">바꿀 금액 (원)</label>
            <input type="number" id="quickFxKrw" value="1000000" step="100000" min="10000" />
          </div>
          <div class="sim-summary num" id="quickFxOut"></div>
        </div>
      </div>
    `;

    mountLineChart($('#fxChartStage', wrap), fx.history, {
      valueKey: 'value',
      prefix: '',
      suffix: '원',
      color: '#00c471'
    });

    const calcQuick = () => {
      const krw = Math.max(0, Number($('#quickFxKrw', wrap).value) || 0);
      const usd = krw / fx.usdKrw;
      const splg = state.data.etfs.find((e) => e.ticker === 'SPLG');
      const qqqm = state.data.etfs.find((e) => e.ticker === 'QQQM');
      const schd = state.data.etfs.find((e) => e.ticker === 'SCHD');
      $('#quickFxOut', wrap).innerHTML = `
        <div>
          <div style="font-size:0.75rem; color:var(--ink-3);">예상 수령 달러</div>
          <div style="font-size:1.25rem; font-weight:800; color:var(--blue);">${fmtUsd(usd)}</div>
        </div>
        <div style="text-align:right; font-size:0.8rem; color:var(--ink-2);">
          SPLG 약 ${(usd / (splg ? splg.price : 85)).toFixed(1)}주 · QQQM 약 ${(usd / (qqqm ? qqqm.price : 262)).toFixed(2)}주<br/>
          SCHD 약 ${(usd / (schd ? schd.price : 35)).toFixed(1)}주 매수 가능
        </div>
      `;
    };
    calcQuick();
    $('#quickFxKrw', wrap).addEventListener('input', calcQuick);
  }

  // ==================== 5. 거시경제 (클릭 시 같은 탭에서 상세 그래프 · 뒤로가기 시 바로 복귀!) ====================
  function renderMacroTab() {
    const { indicators, treasuryGuide, globalStory, geopolitics, globalSummary, globalNews, calendar } = state.data.macro;

    $('#macroIndicatorsGrid').innerHTML = indicators
      .map(
        (ind) => `
      <a class="macro-tile clickable" href="./macro.html?id=${encodeURIComponent(ind.id)}&from=macro">
        <div class="macro-tile-head">
          <span>${esc(ind.name)}</span>
          <i class="sdot ${ind.light}" title="${esc(ind.tag)}"></i>
        </div>
        <div class="macro-tile-val num">${esc(ind.value)}</div>
        <div style="font-size:0.73rem; color:var(--ink-3);">${esc(ind.tag)} · 직전 ${esc(ind.prev)}</div>
        <div class="macro-tile-desc">${esc(ind.impact)}</div>
        <div class="macro-open-hint">그래프 분석 →</div>
      </a>
    `
      )
      .join('');

    // 장단기 미국 국채 비교 스트립 (초단기 SGOV · 단기 SHY · 중기 IEF · 장기 TLT)
    const tStrip = $('#treasuryGuideStrip');
    if (tStrip && Array.isArray(treasuryGuide)) {
      tStrip.innerHTML = `
        <div class="ts-title">미국 국채 만기별 한눈에 비교 (클릭 시 상세)</div>
        <div class="ts-grid">
          ${treasuryGuide
            .map(
              (t) => `
            <button class="ts-card" type="button" data-ts-etf="${t.ticker}">
              <div class="ts-head">
                <span class="ts-term">${esc(t.term)}</span>
                <strong class="ts-ticker">${t.ticker}</strong>
              </div>
              <div class="ts-meta num">배당 ${esc(t.yield)} · 위험 ${esc(t.risk)}</div>
              <div class="ts-role">${esc(t.role)}</div>
            </button>
          `
            )
            .join('')}
        </div>
      `;
      $$('[data-ts-etf]', tStrip).forEach((btn) => {
        btn.addEventListener('click', () => openEtfDrawer(btn.dataset.tsEtf));
      });
    }

    // 지금 세계 경제 스토리 (4단계 인과 흐름)
    const storyEl = $('#globalStoryFlow');
    if (storyEl && Array.isArray(globalStory)) {
      storyEl.innerHTML = globalStory
        .map(
          (st) => `
        <div class="story-step">
          <div class="story-rail">
            <span class="story-num ${st.light}">${esc(st.step)}</span>
          </div>
          <div class="story-content">
            <div class="story-stage">${esc(st.stage)}</div>
            <strong class="story-title">${esc(st.title)}</strong>
            <p class="story-desc">${esc(st.desc)}</p>
          </div>
        </div>
      `
        )
        .join('');
    }

    // 전쟁 · 지정학 · 돌발 변수 카드
    const geoEl = $('#geopoliticsGrid');
    if (geoEl && Array.isArray(geopolitics)) {
      geoEl.innerHTML = geopolitics
        .map(
          (g) => `
        <div class="geo-card">
          <div class="geo-head">
            <strong>${esc(g.title)}</strong>
            <span class="status-pill ${g.light}"><i class="sdot ${g.light}"></i>${esc(g.status)}</span>
          </div>
          <div class="geo-line"><span>체크</span><p>${esc(g.trigger)}</p></div>
          <div class="geo-line"><span>파급</span><p>${esc(g.chain)}</p></div>
          <div class="geo-etfs">
            <div class="geo-etf-group">
              <small>수혜</small>
              ${(g.good || []).map((t) => `<button class="etf-chip" type="button" data-geo-etf="${t}">${t}</button>`).join('')}
            </div>
            <div class="geo-etf-group">
              <small>주의</small>
              ${(g.bad || []).map((t) => `<button class="etf-chip red-chip" type="button" data-geo-etf="${t}">${t}</button>`).join('')}
            </div>
          </div>
        </div>
      `
        )
        .join('');

      $$('[data-geo-etf]', geoEl).forEach((btn) => {
        btn.addEventListener('click', () => openEtfDrawer(btn.dataset.geoEtf));
      });
    }

    // 상단 30초 국제 정황 브리핑
    const briefBox = $('#globalBriefBox');
    if (briefBox && Array.isArray(globalSummary) && globalSummary.length) {
      briefBox.innerHTML = `
        <div class="gb-title">30초 국제 정황 핵심 정리</div>
        <ul class="gb-list">
          ${globalSummary
            .map(
              (item) => `
            <li>
              <span class="status-pill ${item.light}"><i class="sdot ${item.light}"></i>${esc(item.topic)}</span>
              <span>${esc(item.text)}</span>
            </li>
          `
            )
            .join('')}
        </ul>
      `;
      briefBox.style.display = 'block';
    } else if (briefBox) {
      briefBox.style.display = 'none';
    }

    renderGlobalNews(globalNews);

    $('#macroCalendarList').innerHTML = calendar
      .map(
        (c) => `
      <div class="cal-row">
        <div class="cal-dday num">${esc(c.dDay)}</div>
        <div style="min-width:0;">
          <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
            <strong style="font-size:0.9rem;">${esc(c.event)}</strong>
            <span class="status-pill ${c.importance.includes('매우') ? 'red' : c.importance === '높음' ? 'yellow' : 'neutral'}">${esc(c.importance)}</span>
          </div>
          <div style="font-size:0.78rem; color:var(--ink-2); margin-top:2px;">${esc(c.date)} · ${esc(c.note)}</div>
        </div>
      </div>
    `
      )
      .join('');
  }

  function renderGlobalNews(allNews) {
    const list = state.macroNewsFilter === 'all' ? allNews : allNews.filter((n) => n.sentiment === state.macroNewsFilter);
    const wrap = $('#globalNewsList');
    if (!list.length) {
      wrap.innerHTML = `<div style="padding:20px 0; text-align:center; color:var(--ink-3); font-size:0.86rem;">해당 분류의 뉴스가 없습니다.</div>`;
      return;
    }

    wrap.innerHTML = list
      .map((n, idx) => {
        const sm = sentimentMeta(n.sentiment);
        const src = String(n.source || '');
        const isGlobalWire = /^(bloomberg|reuters|wsj|cnbc|financial times|ft)$/i.test(src.trim());
        const d = getNewsDigest(n);
        const chips = (n.affectedEtfs || []).map((t) => `<button class="etf-chip" type="button" data-open="${t}">${t}</button>`).join(' ');
        return `
        <details class="news-item news-digest-item" ${idx === 0 ? 'open' : ''}>
          <summary class="news-summary-trigger">
            <div class="news-top">
              <div style="display:flex; align-items:center; gap:6px;">
                <span class="status-pill ${sm.cls}"><i class="sdot ${sm.cls}"></i>${sm.label}</span>
                ${isGlobalWire ? `<span class="bb-badge">${esc(src)}</span>` : ''}
              </div>
              <span class="news-meta">${esc(src)} · ${esc(n.publishedAt)}</span>
            </div>
            <div class="news-head-row">
              <h4 class="news-title">${esc(n.title)}</h4>
              <span class="news-chev" aria-hidden="true">▾</span>
            </div>
            <p class="news-impact">${esc(n.summary)}</p>
          </summary>

          <div class="digest-panel">
            <div class="digest-row"><strong>핵심</strong><span>${esc(d.what)}</span></div>
            <div class="digest-row"><strong>영향</strong><span>${esc(d.impact)}</span></div>
            <div class="digest-row"><strong>대응</strong><span>${esc(d.action)}</span></div>
            ${chips ? `<div class="digest-etfs"><span class="news-meta">관련 ETF</span> ${chips}</div>` : ''}
          </div>
        </details>
      `;
      })
      .join('');

    $$('[data-open]', wrap).forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        openEtfDrawer(btn.dataset.open);
      });
    });

    const toggleBtn = $('#toggleAllNewsBtn');
    if (toggleBtn) toggleBtn.textContent = '전체 펼치기';
  }

  // ==================== 6. 내 투자 (무인증 초간단 별명 · 카톡 공유 링크 합치기 · 멤버별 비교) ====================
  function getCurrentAuthorName() {
    return state.authorNick || '나';
  }

  function renderAuthorBadge(name) {
    const label = name || '나';
    const st = window.SimpleShare ? window.SimpleShare.getAuthorStyle(label) : { bg: '#e8f3ff', fg: '#1b64da' };
    return `<span class="author-pill" style="background:${st.bg}; color:${st.fg};">${esc(label)}</span>`;
  }

  function getActiveFilteredLogs() {
    const f = state.authorFilter;
    const buyLogs = f === '전체' ? state.buyLogs : state.buyLogs.filter((x) => (x.author || '나') === f);
    const fxLogs = f === '전체' ? state.fxLogs : state.fxLogs.filter((x) => (x.author || '나') === f);
    return { buyLogs, fxLogs };
  }

  function getAllAuthors() {
    const set = new Set();
    for (const l of state.buyLogs) set.add(l.author || '나');
    for (const l of state.fxLogs) set.add(l.author || '나');
    return [...set];
  }

  async function handleCopyShareLink() {
    if (!window.SimpleShare) return;
    if (!state.buyLogs.length && !state.fxLogs.length) {
      showToast('먼저 매수 또는 환전 기록을 1건 이상 추가해 주세요.');
      return;
    }
    const token = await window.SimpleShare.encodeShareToken(getCurrentAuthorName(), state.buyLogs, state.fxLogs);
    const base =
      location.origin && location.protocol.startsWith('http')
        ? `${location.origin}${location.pathname}`
        : location.href.split('?')[0].split('#')[0];
    const link = `${base}?tab=portfolio&share=${token}`;
    try {
      await navigator.clipboard.writeText(link);
      showToast('공유 링크 복사 완료! 카톡으로 보내면 상대방이 바로 합칠 수 있어요.');
    } catch {
      prompt('아래 링크를 복사해 카톡으로 보내세요:', link);
    }
  }

  function renderShareBar() {
    const bar = $('#shareStatusBar');
    const authorBar = $('#authorFilterBar');
    if (!bar) return;

    const nick = getCurrentAuthorName();
    bar.innerHTML = `
      <div class="share-bar-left">
        <button class="author-self-btn" type="button" id="openShareModalNickBtn" title="클릭해서 내 별명 변경">
          내 별명 ${renderAuthorBadge(nick)} <span style="font-size:0.72rem; color:var(--ink-3); font-weight:600;">변경</span>
        </button>
      </div>
      <div class="share-bar-actions">
        <button class="ghost-btn accent" id="copyShareLinkBtn" type="button" style="height:30px; font-size:0.76rem;">공유 링크 복사</button>
      </div>
    `;

    $('#openShareModalNickBtn', bar).addEventListener('click', openShareModal);
    $('#copyShareLinkBtn', bar).addEventListener('click', handleCopyShareLink);

    // 작성자 필터 칩 렌더링 (2명 이상일 때 표시)
    const authors = getAllAuthors();
    if (authorBar) {
      if (authors.length >= 2) {
        if (state.authorFilter !== '전체' && !authors.includes(state.authorFilter)) state.authorFilter = '전체';
        authorBar.style.display = 'flex';
        authorBar.innerHTML = `
          <span class="news-meta" style="font-weight:700; flex-shrink:0;">작성자:</span>
          <button class="pill ${state.authorFilter === '전체' ? 'active' : ''}" type="button" data-af="전체">전체 (${authors.length}명)</button>
          ${authors
            .map((a) => `<button class="pill ${state.authorFilter === a ? 'active' : ''}" type="button" data-af="${esc(a)}">${esc(a)}</button>`)
            .join('')}
        `;
        $$('[data-af]', authorBar).forEach((btn) => {
          btn.addEventListener('click', () => {
            state.authorFilter = btn.dataset.af;
            renderPortfolioTab();
          });
        });
      } else {
        state.authorFilter = '전체';
        authorBar.style.display = 'none';
      }
    }
  }

  function openShareModal() {
    const input = $('#authorNicknameInput');
    if (input) input.value = getCurrentAuthorName();
    $('#shareModalBackdrop').classList.add('open');
    $('#shareModalBackdrop').setAttribute('aria-hidden', 'false');
    if (input) setTimeout(() => input.focus(), 50);
  }

  function closeShareModal() {
    $('#shareModalBackdrop').classList.remove('open');
    $('#shareModalBackdrop').setAttribute('aria-hidden', 'true');
  }

  function openReceiveShareModal(sharedData) {
    state.pendingShareData = sharedData;
    const body = $('#receiveShareBody');
    if (!body) return;
    const sender = sharedData.sender || '지인';
    const bCount = sharedData.buyLogs.length;
    const fCount = sharedData.fxLogs.length;
    const authorsInShare = [...new Set([...sharedData.buyLogs, ...sharedData.fxLogs].map((x) => x.author || sender))];

    body.innerHTML = `
      <div style="padding:14px; border-radius:14px; background:var(--surface-sub); display:flex; flex-direction:column; gap:8px;">
        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
          ${authorsInShare.map((a) => renderAuthorBadge(a)).join('')}
          <strong style="font-size:0.92rem;">님이 보낸 투자 일지</strong>
        </div>
        <div class="news-meta">매수 기록 <strong>${bCount}건</strong> · 환전 기록 <strong>${fCount}건</strong></div>
        <p style="margin:0; font-size:0.8rem; color:var(--ink-2); line-height:1.5;">
          내 기존 기록은 그대로 유지되고, 중복 없는 새 기록만 깔끔하게 합쳐집니다.<br/>
          합친 뒤에는 작성자별 필터와 멤버별 수익률 비교를 바로 볼 수 있어요.
        </p>
      </div>
      <div style="display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap;">
        <button class="ghost-btn" id="cancelReceiveBtn" type="button" style="height:38px;">취소</button>
        <button class="primary-sm-btn" id="confirmMergeShareBtn" type="button" style="padding:10px 18px; font-size:0.86rem;">내 일지와 합치기</button>
      </div>
    `;

    $('#cancelReceiveBtn', body).addEventListener('click', closeReceiveShareModal);
    $('#confirmMergeShareBtn', body).addEventListener('click', () => {
      if (!window.SimpleShare || !state.pendingShareData) return;
      const mb = window.SimpleShare.mergeLogs(state.buyLogs, state.pendingShareData.buyLogs, 'buy');
      const mf = window.SimpleShare.mergeLogs(state.fxLogs, state.pendingShareData.fxLogs, 'fx');
      state.buyLogs = mb.merged;
      state.fxLogs = mf.merged;
      saveBuyLogs();
      saveFxLogs();
      closeReceiveShareModal();
      renderPortfolioTab();
      const totalAdded = mb.added + mf.added;
      showToast(totalAdded > 0 ? `공유 일지 ${totalAdded}건을 합쳤어요! 멤버별로 비교해 보세요.` : '이미 모두 반영된 기록입니다.');
    });

    $('#receiveShareBackdrop').classList.add('open');
    $('#receiveShareBackdrop').setAttribute('aria-hidden', 'false');
  }

  function closeReceiveShareModal() {
    state.pendingShareData = null;
    $('#receiveShareBackdrop').classList.remove('open');
    $('#receiveShareBackdrop').setAttribute('aria-hidden', 'true');
  }

  function computePortfolioStats(buyList = null, fxList = null) {
    const curFx = state.data.fx.usdKrw;
    const etfMap = new Map(state.data.etfs.map((e) => [e.ticker, e]));
    const active = buyList && fxList ? { buyLogs: buyList, fxLogs: fxList } : getActiveFilteredLogs();

    const byTicker = {};
    let totalBuyUsd = 0;
    let totalBuyKrw = 0;
    for (const log of active.buyLogs) {
      const t = log.ticker;
      const qty = Number(log.qty) || 0;
      const price = Number(log.price) || 0;
      const fx = Number(log.fxRate) || curFx;
      if (!byTicker[t]) byTicker[t] = { ticker: t, qty: 0, costUsd: 0, costKrw: 0 };
      byTicker[t].qty += qty;
      byTicker[t].costUsd += qty * price;
      byTicker[t].costKrw += qty * price * fx;
      totalBuyUsd += qty * price;
      totalBuyKrw += qty * price * fx;
    }

    const holdings = Object.values(byTicker)
      .filter((h) => h.qty > 0)
      .map((h) => {
        const etf = etfMap.get(h.ticker);
        const curPrice = etf ? etf.price : h.costUsd / h.qty;
        const avgPrice = h.costUsd / h.qty;
        const avgFx = h.costKrw / Math.max(0.01, h.costUsd);
        const valUsd = h.qty * curPrice;
        const valKrw = valUsd * curFx;
        const stockRetPct = ((curPrice - avgPrice) / avgPrice) * 100;
        const fxRetPct = ((curFx - avgFx) / avgFx) * 100;
        const totalRetPct = ((valKrw - h.costKrw) / Math.max(1, h.costKrw)) * 100;
        return {
          ...h,
          etf,
          curPrice,
          avgPrice,
          avgFx,
          valUsd,
          valKrw,
          profitKrw: valKrw - h.costKrw,
          stockRetPct,
          fxRetPct,
          totalRetPct
        };
      })
      .sort((a, b) => b.valKrw - a.valKrw);

    const totalValUsd = holdings.reduce((s, h) => s + h.valUsd, 0);
    const totalValKrw = holdings.reduce((s, h) => s + h.valKrw, 0);
    const totalProfitKrw = totalValKrw - totalBuyKrw;
    const totalRetPct = totalBuyKrw > 0 ? (totalProfitKrw / totalBuyKrw) * 100 : 0;
    const stockOnlyRetPct = totalBuyUsd > 0 ? ((totalValUsd - totalBuyUsd) / totalBuyUsd) * 100 : 0;
    const avgBuyFx = totalBuyUsd > 0 ? totalBuyKrw / totalBuyUsd : curFx;
    const fxEffectPct = totalBuyUsd > 0 ? ((curFx - avgBuyFx) / avgBuyFx) * 100 : 0;

    const catTotals = { '대표지수': 0, '배당·인컴': 0, '기술·반도체': 0, '채권·금': 0, '레버리지': 0 };
    for (const h of holdings) {
      const c = h.etf ? h.etf.category : '대표지수';
      catTotals[c] = (catTotals[c] || 0) + h.valKrw;
    }

    const totalFxKrw = active.fxLogs.reduce((s, x) => s + (Number(x.krw) || 0), 0);
    const totalFxUsd = active.fxLogs.reduce((s, x) => s + (Number(x.usd) || 0), 0);
    const avgFxRate = totalFxUsd > 0 ? totalFxKrw / totalFxUsd : 0;
    const fxDiffPerUsd = avgFxRate > 0 ? curFx - avgFxRate : 0;
    const estRemainingUsd = totalFxUsd - totalBuyUsd;

    return {
      holdings,
      totalBuyUsd,
      totalBuyKrw,
      totalValUsd,
      totalValKrw,
      totalProfitKrw,
      totalRetPct,
      stockOnlyRetPct,
      fxEffectPct,
      catTotals,
      totalFxKrw,
      totalFxUsd,
      avgFxRate,
      fxDiffPerUsd,
      estRemainingUsd
    };
  }

  function loadSampleJournal() {
    const myNick = state.authorNick && state.authorNick !== '나' ? state.authorNick : '민수';
    state.authorNick = myNick;
    if (window.SimpleShare) window.SimpleShare.saveNickname(myNick);
    state.fxLogs = [
      { id: 'fx1', date: '2026-10-15', krw: 2000000, rate: 1355.0, usd: 1476.01, memo: '1차 분할 환전', author: myNick },
      { id: 'fx2', date: '2026-11-18', krw: 2000000, rate: 1346.8, usd: 1485.0, memo: '2차 환율 안정 구간 환전', author: '지영' }
    ];
    state.buyLogs = [
      { id: 'b1', date: '2026-10-16', ticker: 'SPLG', price: 86.20, qty: 10, fxRate: 1355.0, memo: 'S&P500 적립식 1차', author: myNick },
      { id: 'b2', date: '2026-11-05', ticker: 'SCHD', price: 34.60, qty: 20, fxRate: 1350.0, memo: '배당 방어 비중 확보', author: '지영' },
      { id: 'b3', date: '2026-11-19', ticker: 'QQQM', price: 271.50, qty: 3, fxRate: 1346.8, memo: '나스닥 조정 1차 분할', author: myNick },
      { id: 'b4', date: '2026-11-22', ticker: 'SGOV', price: 100.55, qty: 8, fxRate: 1346.8, memo: '달러 파킹 대기 자금', author: '지영' }
    ];
    saveFxLogs();
    saveBuyLogs();
    renderPortfolioTab();
    showToast(`${myNick} · 지영 2인 공동 일지 샘플을 불러왔어요!`);
  }

  function renderPortfolioTab(preselectTicker = null) {
    $$('#portfolioSubTabs .seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.sub === state.portfolioSub));
    const root = $('#portfolioRoot');
    if (!root || !state.data) return;

    renderShareBar();
    const activeLogs = getActiveFilteredLogs();
    const stats = computePortfolioStats(activeLogs.buyLogs, activeLogs.fxLogs);
    const curFx = state.data.fx.usdKrw;
    const allAuthors = getAllAuthors();

    if (state.portfolioSub === 'recommend') {
      renderRecommendationsInto(root);
      return;
    }

    if (state.portfolioSub === 'analysis') {
      if (!stats.holdings.length && !activeLogs.fxLogs.length) {
        root.innerHTML = `
          <div class="surface" style="text-align:center; padding:36px 20px;">
            <h2 class="section-title" style="margin-bottom:8px;">아직 기록된 매수·환전 일지가 없어요</h2>
            <p class="section-sub" style="margin-bottom:20px;">매수한 ETF나 환전 내역을 기록하면 수익률·환차익·비중 진단·보유 종목 핵심 이슈를 자동으로 분석해 드립니다.</p>
            <div style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap;">
              <button class="primary-sm-btn" id="goAddBuyBtn" type="button" style="padding:10px 16px; font-size:0.86rem;">+ ETF 매수 기록하기</button>
              <button class="ghost-btn" id="goAddFxBtn" type="button" style="height:38px;">+ 환전 기록하기</button>
              <button class="ghost-btn accent" id="goRecComboBtn" type="button" style="height:38px;">추천 조합 먼저 보기</button>
              <button class="ghost-btn" id="loadSampleBtn" type="button" style="height:38px;">샘플 미리보기</button>
            </div>
          </div>
        `;
        $('#goAddBuyBtn', root).addEventListener('click', () => { state.portfolioSub = 'etflog'; renderPortfolioTab(); });
        $('#goAddFxBtn', root).addEventListener('click', () => { state.portfolioSub = 'fxlog'; renderPortfolioTab(); });
        $('#goRecComboBtn', root).addEventListener('click', () => { state.portfolioSub = 'recommend'; renderPortfolioTab(); });
        $('#loadSampleBtn', root).addEventListener('click', loadSampleJournal);
        return;
      }

      // 카테고리 비중 계산 및 자동 진단 문구
      const totalV = Math.max(1, stats.totalValKrw);
      const pcts = {
        '대표지수': Math.round((stats.catTotals['대표지수'] / totalV) * 100),
        '배당·인컴': Math.round((stats.catTotals['배당·인컴'] / totalV) * 100),
        '기술·반도체': Math.round((stats.catTotals['기술·반도체'] / totalV) * 100),
        '채권·금': Math.round((stats.catTotals['채권·금'] / totalV) * 100),
        '레버리지': Math.round(((stats.catTotals['레버리지'] || 0) / totalV) * 100)
      };

      const diagLines = [];
      if (pcts['레버리지'] >= 15) {
        diagLines.push({ light: 'red', label: '레버리지 경고', text: `3배 레버리지 비중이 ${pcts['레버리지']}%입니다. VIX 28 고변동 구간에서는 10% 이하로 제한하는 것이 안전해요.` });
      }
      if (pcts['기술·반도체'] >= 50) {
        diagLines.push({ light: 'red', label: '비중 경고', text: `기술·반도체 비중이 ${pcts['기술·반도체']}%로 높아요. VIX 28 장세에서는 SCHD·SGOV 분산이 안전합니다.` });
      } else if (pcts['대표지수'] + pcts['배당·인컴'] >= 50) {
        diagLines.push({ light: 'green', label: '균형 양호', text: `대표지수·배당 비중이 ${pcts['대표지수'] + pcts['배당·인컴']}%로 변동성 방어가 잘 잡혀 있어요.` });
      }
      if (pcts['채권·금'] === 0 && stats.holdings.length > 0) {
        diagLines.push({ light: 'yellow', label: '현금 방어', text: '채권·파킹(SGOV·TLT) 비중이 0%예요. 여유 달러를 SGOV에 두면 연 4%대 이자를 받으며 대기할 수 있어요.' });
      }
      if (stats.avgFxRate > 0) {
        const fxGood = curFx >= stats.avgFxRate;
        diagLines.push({
          light: fxGood ? 'green' : 'yellow',
          label: '환전 단가',
          text: `평균 환전가 ${stats.avgFxRate.toFixed(1)}원 vs 현재 ${curFx.toLocaleString('ko-KR')}원 (${stats.fxDiffPerUsd >= 0 ? '+' : ''}${stats.fxDiffPerUsd.toFixed(1)}원/달러).`
        });
      }

      // 보유 종목 관련 주요 이슈 자동 추출
      const ownedTickers = new Set(stats.holdings.map((h) => h.ticker));
      const matchedGlobal = state.data.macro.globalNews.filter((n) => (n.affectedEtfs || []).some((t) => ownedTickers.has(t)));
      const ownedEtfNews = [];
      for (const h of stats.holdings) {
        if (h.etf && h.etf.news && h.etf.news.length) {
          ownedEtfNews.push({ ...h.etf.news[0], affectedEtfs: [h.ticker], id: `own-${h.ticker}` });
        }
      }
      const myIssues = [...matchedGlobal, ...ownedEtfNews].slice(0, 6);

      // 멤버별 비교 보드 (2명 이상 + 전체 보기일 때 표시)
      let memberBoardHtml = '';
      if (allAuthors.length >= 2 && state.authorFilter === '전체') {
        const mCards = allAuthors
          .map((author) => {
            const mBuy = state.buyLogs.filter((x) => (x.author || '나') === author);
            const mFx = state.fxLogs.filter((x) => (x.author || '나') === author);
            const mAvatar = mBuy.find((x) => x.authorAvatar)?.authorAvatar || mFx.find((x) => x.authorAvatar)?.authorAvatar || '';
            const ms = computePortfolioStats(mBuy, mFx);
            return `
            <button class="member-card" type="button" data-pick-member="${esc(author)}">
              <div class="mc-top">
                ${renderAuthorBadge(author, mAvatar)}
                <span class="row-delta num ${ms.totalRetPct >= 0 ? 'up' : 'down'}">${fmtPct(ms.totalRetPct)}</span>
              </div>
              <div class="mc-val num">${fmtKrw(ms.totalValKrw)}</div>
              <div class="news-meta num">보유 ${ms.holdings.length}종 · 평균환율 ${ms.avgFxRate > 0 ? `${ms.avgFxRate.toFixed(0)}원` : '-'}</div>
            </button>
          `;
          })
          .join('');
        memberBoardHtml = `
          <div class="surface">
            <div class="list-header" style="margin-bottom:12px;">
              <div>
                <h2 class="section-title">멤버별 투자 현황 비교</h2>
                <p class="section-sub">멤버를 누르면 그 사람의 포트폴리오와 일지만 따로 볼 수 있어요</p>
              </div>
            </div>
            <div class="member-grid">${mCards}</div>
          </div>
        `;
      }

      root.innerHTML = `
        <!-- 1. 내 계좌 종합 요약 -->
        <div class="surface">
          <div class="hero-eyebrow">
            <span class="eyebrow-text">${state.authorFilter === '전체' && allAuthors.length >= 2 ? '함께 보는 ETF 포트폴리오 (전체 합산)' : `${esc(state.authorFilter === '전체' ? getCurrentAuthorName() : state.authorFilter)}님의 미국 ETF 포트폴리오`}</span>
            <span class="source-tag">현재 환율 ${curFx.toLocaleString('ko-KR')}원 기준</span>
          </div>
          <div style="display:flex; align-items:baseline; gap:10px; flex-wrap:wrap;">
            <span class="fx-rate-big num">${fmtKrw(stats.totalValKrw)}</span>
            <span class="row-delta num ${stats.totalProfitKrw >= 0 ? 'up' : 'down'}" style="font-size:1rem;">
              ${stats.totalProfitKrw >= 0 ? '+' : ''}${fmtKrw(stats.totalProfitKrw)} (${fmtPct(stats.totalRetPct)})
            </span>
          </div>
          <div class="verdict-krw num">달러 평가액 ${fmtUsd(stats.totalValUsd)} · 매수 원금 ${fmtKrw(stats.totalBuyKrw)}</div>

          <div class="kpi-trio num">
            <div class="kpi-item">
              <span>주가 수익률</span>
              <strong style="color:${stats.stockOnlyRetPct >= 0 ? 'var(--up)' : 'var(--down)'}">${fmtPct(stats.stockOnlyRetPct)}</strong>
            </div>
            <div class="kpi-item">
              <span>환율 효과</span>
              <strong style="color:${stats.fxEffectPct >= 0 ? 'var(--up)' : 'var(--down)'}">${fmtPct(stats.fxEffectPct)}</strong>
            </div>
            <div class="kpi-item">
              <span>평균 환전 단가</span>
              <strong>${stats.avgFxRate > 0 ? `${stats.avgFxRate.toFixed(1)}원` : '기록 없음'}</strong>
            </div>
          </div>
        </div>

        ${memberBoardHtml}

        <!-- 2. 자산 배분 & 자동 진단 -->
        <div class="surface">
          <div class="list-header" style="margin-bottom:12px;">
            <div>
              <h2 class="section-title">포트폴리오 비중 &amp; 진단</h2>
              <p class="section-sub">보유 종목의 섹터 편중과 환전 효율을 자동 점검했어요</p>
            </div>
          </div>

          <div class="alloc-bar">
            <div style="width:${pcts['대표지수']}%; background:#3182f6;"></div>
            <div style="width:${pcts['배당·인컴']}%; background:#00c471;"></div>
            <div style="width:${pcts['기술·반도체']}%; background:#8b5cf6;"></div>
            <div style="width:${pcts['채권·금']}%; background:#ff9f0a;"></div>
            <div style="width:${pcts['레버리지']}%; background:#f04452;"></div>
          </div>
          <div class="alloc-legend num">
            <span><i style="background:#3182f6;"></i>대표지수 ${pcts['대표지수']}%</span>
            <span><i style="background:#00c471;"></i>배당·인컴 ${pcts['배당·인컴']}%</span>
            <span><i style="background:#8b5cf6;"></i>기술·반도체 ${pcts['기술·반도체']}%</span>
            <span><i style="background:#ff9f0a;"></i>채권·금 ${pcts['채권·금']}%</span>
            ${pcts['레버리지'] > 0 ? `<span><i style="background:#f04452;"></i>레버리지 ${pcts['레버리지']}%</span>` : ''}
          </div>

          <ul class="gb-list" style="margin-top:14px;">
            ${diagLines
              .map(
                (d) => `
              <li>
                <span class="status-pill ${d.light}"><i class="sdot ${d.light}"></i>${d.label}</span>
                <span>${esc(d.text)}</span>
              </li>
            `
              )
              .join('')}
          </ul>
        </div>

        <!-- 3. 내 보유 종목별 신호등 & 추가 매수 가이드 -->
        <div class="surface">
          <div class="list-header" style="margin-bottom:10px;">
            <div>
              <h2 class="section-title">보유 종목별 현재 진단 (${stats.holdings.length})</h2>
              <p class="section-sub">내 평단가와 현재 매력 가격구간을 비교해 드립니다</p>
            </div>
            <button class="primary-sm-btn" type="button" id="addMoreBuyBtn">+ 매수 추가</button>
          </div>
          <div class="etf-list">
            ${stats.holdings
              .map((h) => {
                const pz = h.etf?.priceZones;
                const actionHint =
                  h.stockRetPct <= -3 && pz?.light !== 'red'
                    ? '평단 이하 · 분할 물타기 검토 가능'
                    : h.etf?.light === 'red'
                      ? '단기 변동성 큼 · 추가 매수 보류'
                      : '안정 구간 · 보유 및 정기 적립 유지';
                return `
                <div class="etf-row" data-open-own="${h.ticker}" role="button" tabindex="0">
                  <div class="etf-row-left">
                    <div class="ticker-avatar ${categoryClass(h.etf?.category || '대표지수')}">${h.ticker}</div>
                    <div class="etf-name-col">
                      <div class="etf-name-top">
                        <strong>${esc(h.etf?.krName || h.ticker)}</strong>
                        <span class="etf-ticker-sub num">${h.qty}주</span>
                      </div>
                      <div class="etf-meta-line num">
                        <span>평단 ${fmtUsd(h.avgPrice)} → 현재 ${fmtUsd(h.curPrice)}</span>
                      </div>
                      <div style="font-size:0.75rem; color:var(--blue); font-weight:600; margin-top:2px;">${actionHint}</div>
                    </div>
                  </div>
                  <div class="etf-row-mid">
                    <span class="status-pill ${h.etf?.light || 'yellow'}"><i class="sdot ${h.etf?.light || 'yellow'}"></i>${esc(pz?.status || h.etf?.actionBadge || '중립')}</span>
                  </div>
                  <div class="etf-row-right num">
                    <span class="row-price">${fmtKrw(h.valKrw)}</span>
                    <span class="row-delta ${h.totalRetPct >= 0 ? 'up' : 'down'}">${fmtPct(h.totalRetPct)}</span>
                    <span class="row-krw">${h.profitKrw >= 0 ? '+' : ''}${fmtKrw(h.profitKrw)}</span>
                  </div>
                </div>
              `;
              })
              .join('')}
          </div>
        </div>

        <!-- 4. 내 보유 종목 주요 이슈 요약본 -->
        <div class="surface">
          <div class="list-header" style="margin-bottom:10px;">
            <div>
              <h2 class="section-title">내 보유 종목 주요 이슈</h2>
              <p class="section-sub">내가 산 ETF에 직접 영향을 주는 호재·악재 요약만 모았어요</p>
            </div>
          </div>
          <div class="news-feed">
            ${myIssues.length
              ? myIssues
                  .map((n, idx) => {
                    const sm = sentimentMeta(n.sentiment);
                    const d = getNewsDigest(n);
                    const chips = (n.affectedEtfs || [])
                      .filter((t) => ownedTickers.has(t))
                      .map((t) => `<button class="etf-chip" type="button" data-open-own="${t}">${t}</button>`)
                      .join(' ');
                    return `
                    <details class="news-item news-digest-item" ${idx === 0 ? 'open' : ''}>
                      <summary class="news-summary-trigger">
                        <div class="news-top">
                          <span class="status-pill ${sm.cls}"><i class="sdot ${sm.cls}"></i>${sm.label}</span>
                          <span class="news-meta">${esc(n.source)} · ${esc(n.publishedAt)}</span>
                        </div>
                        <div class="news-head-row">
                          <h4 class="news-title">${esc(n.title)}</h4>
                          <span class="news-chev">▾</span>
                        </div>
                        <p class="news-impact">${esc(n.summary)}</p>
                      </summary>
                      <div class="digest-panel">
                        <div class="digest-row"><strong>핵심</strong><span>${esc(d.what)}</span></div>
                        <div class="digest-row"><strong>영향</strong><span>${esc(d.impact)}</span></div>
                        <div class="digest-row"><strong>대응</strong><span>${esc(d.action)}</span></div>
                        ${chips ? `<div class="digest-etfs"><span class="news-meta">내 보유</span> ${chips}</div>` : ''}
                      </div>
                    </details>
                  `;
                  })
                  .join('')
              : '<div style="padding:20px 0; text-align:center; color:var(--ink-3); font-size:0.86rem;">보유 종목을 추가하면 관련 핵심 이슈가 자동으로 모입니다.</div>'}
          </div>
        </div>
      `;

      $('#addMoreBuyBtn', root).addEventListener('click', () => { state.portfolioSub = 'etflog'; renderPortfolioTab(); });
      $$('[data-pick-member]', root).forEach((btn) => {
        btn.addEventListener('click', () => {
          state.authorFilter = btn.dataset.pickMember;
          renderPortfolioTab();
        });
      });
      $$('[data-open-own]', root).forEach((el) => {
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          openEtfDrawer(el.dataset.openOwn);
        });
      });
      return;
    }

    // ==================== Sub-tab 2: ETF 매수 일지 ====================
    if (state.portfolioSub === 'etflog') {
      const defaultTicker = preselectTicker || 'SPLG';
      const defEtf = state.data.etfs.find((e) => e.ticker === defaultTicker) || state.data.etfs[0];

      root.innerHTML = `
        <div class="surface">
          <div class="list-header" style="margin-bottom:14px;">
            <div>
              <h2 class="section-title">ETF 매수 기록 추가</h2>
              <p class="section-sub">종목을 고르면 현재가와 환율이 자동으로 채워져 간편하게 기록할 수 있어요</p>
            </div>
          </div>
          <form id="buyLogForm" class="journal-form">
            <div class="jf-grid">
              <div class="sim-field">
                <label for="bfDate">매수 날짜</label>
                <input type="date" id="bfDate" value="${todayStr()}" required />
              </div>
              <div class="sim-field">
                <label for="bfTicker">종목 선택</label>
                <select id="bfTicker" class="minimal-select" style="width:100%; height:38px;">
                  ${state.data.etfs.map((e) => `<option value="${e.ticker}" ${e.ticker === defEtf.ticker ? 'selected' : ''}>${e.ticker} · ${esc(e.krName)}</option>`).join('')}
                </select>
              </div>
              <div class="sim-field">
                <label for="bfPrice">매수 단가 ($)</label>
                <input type="number" id="bfPrice" step="any" min="0.01" value="${defEtf.price}" required />
              </div>
              <div class="sim-field">
                <label for="bfQty">수량 (주)</label>
                <input type="number" id="bfQty" step="any" min="0.0001" value="5" required />
              </div>
              <div class="sim-field">
                <label for="bfFx">매수 시 환율 (원)</label>
                <input type="number" id="bfFx" step="any" min="500" value="${curFx}" required />
              </div>
              <div class="sim-field">
                <label for="bfMemo">한 줄 메모 (선택)</label>
                <input type="text" id="bfMemo" placeholder="예: RSI 과매도 1차 분할" maxlength="50" />
              </div>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-top:12px; flex-wrap:wrap;">
              <span class="muted-preview num" id="bfPreview"></span>
              <button class="primary-sm-btn" type="submit" style="padding:10px 18px; font-size:0.86rem;">매수 일지 저장</button>
            </div>
          </form>
        </div>

        <div class="surface">
          <div class="list-header" style="margin-bottom:10px;">
            <h2 class="section-title">매수 일지 내역 (${activeLogs.buyLogs.length}건)</h2>
            ${state.buyLogs.length ? '<button class="ghost-btn" id="clearBuyLogsBtn" type="button" style="height:30px; font-size:0.75rem; color:var(--red);">전체 삭제</button>' : ''}
          </div>
          <div class="journal-list">
            ${activeLogs.buyLogs.length
              ? [...activeLogs.buyLogs]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((log) => {
                    const etf = state.data.etfs.find((e) => e.ticker === log.ticker);
                    const costKrw = log.price * log.qty * log.fxRate;
                    const curKrw = (etf ? etf.price : log.price) * log.qty * curFx;
                    const ret = ((curKrw - costKrw) / Math.max(1, costKrw)) * 100;
                    return `
                    <div class="j-row">
                      <div class="j-left">
                        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                          ${renderAuthorBadge(log.author || getCurrentAuthorName())}
                          <button class="etf-chip" type="button" data-open-buy="${log.ticker}">${log.ticker}</button>
                          <strong class="num" style="font-size:0.9rem;">${log.qty}주 × ${fmtUsd(log.price)}</strong>
                          <span class="news-meta">${esc(log.date)} · 환율 ${Number(log.fxRate).toLocaleString('ko-KR')}원</span>
                        </div>
                        ${log.memo ? `<div style="font-size:0.8rem; color:var(--ink-2); margin-top:3px;">${esc(log.memo)}</div>` : ''}
                      </div>
                      <div class="j-right num">
                        <div style="font-weight:700; font-size:0.88rem;">${fmtKrw(costKrw)}</div>
                        <div class="row-delta ${ret >= 0 ? 'up' : 'down'}" style="font-size:0.78rem;">현재 ${fmtPct(ret)}</div>
                        <button class="del-btn" type="button" data-del-buy="${log.id}">삭제</button>
                      </div>
                    </div>
                  `;
                  })
                  .join('')
              : '<div style="padding:24px 0; text-align:center; color:var(--ink-3); font-size:0.86rem;">아직 매수 기록이 없습니다. 위에서 첫 매수를 기록해 보세요.</div>'}
          </div>
        </div>
      `;

      const updateBuyPreview = () => {
        const p = Number($('#bfPrice', root).value) || 0;
        const q = Number($('#bfQty', root).value) || 0;
        const fx = Number($('#bfFx', root).value) || curFx;
        $('#bfPreview', root).textContent = `작성자 [${getCurrentAuthorName()}] · 예상 ${fmtUsd(p * q)} (약 ${fmtKrw(p * q * fx)})`;
      };
      updateBuyPreview();

      $('#bfTicker', root).addEventListener('change', (e) => {
        const found = state.data.etfs.find((x) => x.ticker === e.target.value);
        if (found) $('#bfPrice', root).value = found.price;
        updateBuyPreview();
      });
      ['#bfPrice', '#bfQty', '#bfFx'].forEach((id) => $(id, root).addEventListener('input', updateBuyPreview));

      $('#buyLogForm', root).addEventListener('submit', (ev) => {
        ev.preventDefault();
        const item = {
          id: `b_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          date: $('#bfDate', root).value || todayStr(),
          ticker: $('#bfTicker', root).value,
          price: Number($('#bfPrice', root).value),
          qty: Number($('#bfQty', root).value),
          fxRate: Number($('#bfFx', root).value) || curFx,
          memo: $('#bfMemo', root).value.trim(),
          author: getCurrentAuthorName()
        };
        state.buyLogs.push(item);
        saveBuyLogs();
        showToast(`[${item.author}] 매수 일지에 저장했어요.`);
        renderPortfolioTab(item.ticker);
      });

      $$('[data-del-buy]', root).forEach((btn) => {
        btn.addEventListener('click', () => {
          const delId = btn.dataset.delBuy;
          state.buyLogs = state.buyLogs.filter((x) => x.id !== delId);
          saveBuyLogs();
          renderPortfolioTab();
          showToast('기록을 삭제했어요.');
        });
      });

      $$('[data-open-buy]', root).forEach((btn) => {
        btn.addEventListener('click', () => openEtfDrawer(btn.dataset.openBuy));
      });

      const clearBtn = $('#clearBuyLogsBtn', root);
      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          state.buyLogs = [];
          saveBuyLogs();
          renderPortfolioTab();
          showToast('매수 일지를 모두 비웠어요.');
        });
      }
      return;
    }

    // ==================== Sub-tab 3: 환전 일지 ====================
    root.innerHTML = `
      <div class="surface">
        <div class="hero-eyebrow">
          <span class="eyebrow-text">내 달러 환전 현황</span>
          <span class="source-tag">현재 환율 ${curFx.toLocaleString('ko-KR')}원</span>
        </div>
        <div class="kpi-trio num" style="margin-top:4px; padding-top:0; border-top:none;">
          <div class="kpi-item">
            <span>내 평균 환전 단가</span>
            <strong style="font-size:1.15rem; color:var(--blue);">${stats.avgFxRate > 0 ? `${stats.avgFxRate.toFixed(1)}원` : '-'}</strong>
          </div>
          <div class="kpi-item">
            <span>누적 확보 달러</span>
            <strong style="font-size:1.15rem;">${fmtUsd(stats.totalFxUsd)}</strong>
          </div>
          <div class="kpi-item">
            <span>현재 대비 환차손익</span>
            <strong style="font-size:1.05rem; color:${stats.fxDiffPerUsd >= 0 ? 'var(--up)' : 'var(--down)'}">
              ${stats.avgFxRate > 0 ? `${stats.fxDiffPerUsd >= 0 ? '+' : ''}${stats.fxDiffPerUsd.toFixed(1)}원/$` : '-'}
            </strong>
          </div>
        </div>
        ${stats.totalFxUsd > 0 ? `<div class="verdict-krw num" style="margin-top:10px;">총 환전 원화 ${fmtKrw(stats.totalFxKrw)} · ETF 매수 사용 후 잔여 달러 추정: <strong>${fmtUsd(Math.max(0, stats.estRemainingUsd))}</strong></div>` : ''}
      </div>

      <div class="surface">
        <div class="list-header" style="margin-bottom:14px;">
          <div>
            <h2 class="section-title">환전 기록 추가</h2>
            <p class="section-sub">원화와 적용 환율을 넣으면 내 평균 환전 단가가 자동 계산됩니다</p>
          </div>
        </div>
        <form id="fxLogForm" class="journal-form">
          <div class="jf-grid">
            <div class="sim-field">
              <label for="ffDate">환전 날짜</label>
              <input type="date" id="ffDate" value="${todayStr()}" required />
            </div>
            <div class="sim-field">
              <label for="ffKrw">환전 금액 (원)</label>
              <input type="number" id="ffKrw" step="any" min="1000" value="1000000" required />
            </div>
            <div class="sim-field">
              <label for="ffRate">적용 환율 (원/$)</label>
              <input type="number" id="ffRate" step="any" min="500" value="${curFx}" required />
            </div>
            <div class="sim-field" style="grid-column: 1 / -1;">
              <label for="ffMemo">한 줄 메모 (선택)</label>
              <input type="text" id="ffMemo" placeholder="예: 1,340원대 분할 환전 1차" maxlength="50" />
            </div>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-top:12px; flex-wrap:wrap;">
            <span class="muted-preview num" id="ffPreview"></span>
            <button class="primary-sm-btn" type="submit" style="padding:10px 18px; font-size:0.86rem;">환전 일지 저장</button>
          </div>
        </form>
      </div>

      <div class="surface">
        <div class="list-header" style="margin-bottom:10px;">
          <h2 class="section-title">환전 일지 내역 (${activeLogs.fxLogs.length}건)</h2>
          ${state.fxLogs.length ? '<button class="ghost-btn" id="clearFxLogsBtn" type="button" style="height:30px; font-size:0.75rem; color:var(--red);">전체 삭제</button>' : ''}
        </div>
        <div class="journal-list">
          ${activeLogs.fxLogs.length
            ? [...activeLogs.fxLogs]
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((log) => {
                  const diff = curFx - Number(log.rate);
                  return `
                  <div class="j-row">
                    <div class="j-left">
                      <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                        ${renderAuthorBadge(log.author || getCurrentAuthorName())}
                        <strong class="num" style="font-size:0.92rem;">${fmtKrw(log.krw)} → ${fmtUsd(log.usd)}</strong>
                        <span class="news-meta">${esc(log.date)} · 적용 ${Number(log.rate).toLocaleString('ko-KR')}원</span>
                      </div>
                      ${log.memo ? `<div style="font-size:0.8rem; color:var(--ink-2); margin-top:3px;">${esc(log.memo)}</div>` : ''}
                    </div>
                    <div class="j-right num">
                      <div class="row-delta ${diff >= 0 ? 'up' : 'down'}" style="font-size:0.8rem;">${diff >= 0 ? '+' : ''}${diff.toFixed(1)}원/$</div>
                      <button class="del-btn" type="button" data-del-fx="${log.id}">삭제</button>
                    </div>
                  </div>
                `;
                })
                .join('')
            : '<div style="padding:24px 0; text-align:center; color:var(--ink-3); font-size:0.86rem;">아직 환전 기록이 없습니다. 위에서 분할 환전 내역을 기록해 보세요.</div>'}
        </div>
      </div>
    `;

    const updateFxPreview = () => {
      const k = Number($('#ffKrw', root).value) || 0;
      const r = Math.max(500, Number($('#ffRate', root).value) || curFx);
      $('#ffPreview', root).textContent = `작성자 [${getCurrentAuthorName()}] · 확보 달러 ${fmtUsd(k / r)}`;
    };
    updateFxPreview();
    ['#ffKrw', '#ffRate'].forEach((id) => $(id, root).addEventListener('input', updateFxPreview));

    $('#fxLogForm', root).addEventListener('submit', (ev) => {
      ev.preventDefault();
      const krw = Number($('#ffKrw', root).value);
      const rate = Number($('#ffRate', root).value);
      const item = {
        id: `fx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        date: $('#ffDate', root).value || todayStr(),
        krw,
        rate,
        usd: +(krw / rate).toFixed(2),
        memo: $('#ffMemo', root).value.trim(),
        author: getCurrentAuthorName()
      };
      state.fxLogs.push(item);
      saveFxLogs();
      showToast(`[${item.author}] 환전 일지에 저장했어요.`);
      renderPortfolioTab();
    });

    $$('[data-del-fx]', root).forEach((btn) => {
      btn.addEventListener('click', () => {
        const delId = btn.dataset.delFx;
        state.fxLogs = state.fxLogs.filter((x) => x.id !== delId);
        saveFxLogs();
        renderPortfolioTab();
        showToast('환전 기록을 삭제했어요.');
      });
    });

    const clearFxBtn = $('#clearFxLogsBtn', root);
    if (clearFxBtn) {
      clearFxBtn.addEventListener('click', () => {
        state.fxLogs = [];
        saveFxLogs();
        renderPortfolioTab();
        showToast('환전 일지를 모두 비웠어요.');
      });
    }
  }

  // ==================== 탭 · 테마 · 데이터 로드 ====================
  function switchTab(tab, updateUrl = true) {
    const valid = ['dashboard', 'fx', 'macro', 'portfolio'].includes(tab) ? tab : 'dashboard';
    state.activeTab = valid;
    $$('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${valid}`));
    $$('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === valid));
    $$('.m-tab[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === valid));
    if (valid === 'portfolio' && state.data) renderPortfolioTab();
    if (updateUrl && location.protocol.startsWith('http')) {
      const url = new URL(location.href);
      url.searchParams.set('tab', valid);
      url.searchParams.delete('etf');
      history.replaceState(null, '', url.pathname + url.search);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function applyTheme(mode) {
    document.documentElement.setAttribute('data-theme', mode);
    const metaTheme = $('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', mode === 'dark' ? '#1b1b20' : '#ffffff');
    $('#themeSvg').innerHTML =
      mode === 'dark'
        ? '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>'
        : '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
  }

  function initTheme() {
    const saved = localStorage.getItem('etf_pulse_theme_v2') || 'light';
    applyTheme(saved);
  }

  function toggleTheme() {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    localStorage.setItem('etf_pulse_theme_v2', next);
    applyTheme(next);
  }

  async function loadData(bust = false) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`./data/market-data.json${bust ? `?t=${Date.now()}` : ''}`, {
        cache: 'no-store',
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error('fetch err');
      state.data = await res.json();
    } catch {
      if (window.MARKET_DATA) state.data = window.MARKET_DATA;
      else return showToast('데이터를 불러오지 못했습니다.');
    }

    // 브라우저에서 방금 버튼으로 실시간 갱신한 캐시가 서버 파일보다 최신이면 유지
    if (!bust) {
      try {
        const cached = JSON.parse(localStorage.getItem(LIVE_CACHE_KEY) || 'null');
        if (
          cached &&
          cached.meta?.updatedAt &&
          cached.etfs?.length === state.data.etfs?.length &&
          cached.macro?.globalStory &&
          new Date(cached.meta.updatedAt) > new Date(state.data.meta.updatedAt)
        ) {
          state.data = cached;
        }
      } catch {}
    }

    renderOverview();
    renderEtfList();
    renderFxTab();
    renderMacroTab();
    renderPortfolioTab();

    // URL 파라미터 ?tab=macro / portfolio, ?share=... (공유 링크 수신) 및 ?etf=QQQM 처리
    const urlParams = new URLSearchParams(location.search);
    const shareToken = urlParams.get('share');
    if (shareToken && window.SimpleShare) {
      const decoded = await window.SimpleShare.decodeShareToken(shareToken);
      if (decoded && (decoded.buyLogs.length || decoded.fxLogs.length)) {
        switchTab('portfolio', false);
        openReceiveShareModal(decoded);
        // 주소창에서 긴 share 파라미터는 정리
        try {
          const clean = new URL(location.href);
          clean.searchParams.delete('share');
          history.replaceState(null, '', clean.pathname + clean.search);
        } catch {}
      }
    }

    const tabParam = urlParams.get('tab');
    if (tabParam && ['dashboard', 'fx', 'macro', 'portfolio'].includes(tabParam)) {
      switchTab(tabParam, false);
    }
    const etfParam = urlParams.get('etf');
    if (etfParam && !state.selectedTicker) {
      openEtfDrawer(etfParam.toUpperCase());
    } else if (state.selectedTicker) {
      const found = state.data.etfs.find((e) => e.ticker === state.selectedTicker);
      if (found) renderDrawerContent(found);
    }
  }

  // ==================== 버튼 클릭 시 브라우저에서 직접 실시간 최신화 ====================
  function formatNowKst() {
    const now = new Date();
    const kst = new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60000);
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const y = kst.getFullYear();
    const m = String(kst.getMonth() + 1).padStart(2, '0');
    const d = String(kst.getDate()).padStart(2, '0');
    const hh = String(kst.getHours()).padStart(2, '0');
    const mm = String(kst.getMinutes()).padStart(2, '0');
    return {
      iso: `${y}-${m}-${d}T${hh}:${mm}:00+09:00`,
      label: `${m}.${d} (${days[kst.getDay()]}) ${hh}:${mm} 기준`
    };
  }

  async function fetchJsonWithTimeout(url, ms = 5500) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    } finally {
      clearTimeout(t);
    }
  }

  async function fetchLiveUsdKrw() {
    // 1순위: open.er-api.com (CORS 지원, 무료 실시간 환율)
    const r1 = await fetchJsonWithTimeout('https://open.er-api.com/v6/latest/USD', 5000);
    if (r1?.rates?.KRW) return Math.round(Number(r1.rates.KRW) * 100) / 100;
    // 2순위: frankfurter.app (유럽중앙은행 공식 환율, CORS 지원)
    const r2 = await fetchJsonWithTimeout('https://api.frankfurter.app/latest?from=USD&to=KRW', 5000);
    if (r2?.rates?.KRW) return Math.round(Number(r2.rates.KRW) * 100) / 100;
    return null;
  }

  async function fetchYahooLiveBrowser(symbol, timeoutMs = 3500) {
    const target = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`;
    const w = await fetchJsonWithTimeout(`https://api.allorigins.win/get?url=${encodeURIComponent(target)}`, timeoutMs);
    let json = null;
    try { json = w?.contents ? JSON.parse(w.contents) : null; } catch { json = null; }
    if (!json) {
      json = await fetchJsonWithTimeout(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`, timeoutMs);
    }
    const res = json?.chart?.result?.[0];
    if (!res) return null;
    const meta = res.meta || {};
    const ts = res.timestamp || [];
    const rawCloses = res.indicators?.quote?.[0]?.close || [];
    const points = [];
    for (let i = 0; i < ts.length; i++) {
      if (rawCloses[i] != null) {
        points.push({ date: new Date(ts[i] * 1000).toISOString().slice(0, 10), close: Math.round(Number(rawCloses[i]) * 100) / 100 });
      }
    }
    if (points.length >= 2) {
      const cur = meta.regularMarketPrice != null ? Math.round(Number(meta.regularMarketPrice) * 100) / 100 : points[points.length - 1].close;
      const prev = meta.chartPreviousClose != null && points.length < 3 ? Number(meta.chartPreviousClose) : points[points.length - 2].close;
      return { cur, prev, points };
    }
    return null;
  }

  function calcBrowserRsi14(closes) {
    if (closes.length < 15) return 50;
    let gains = 0;
    let losses = 0;
    for (let i = closes.length - 14; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1];
      if (d > 0) gains += d;
      else losses += Math.abs(d);
    }
    if (losses === 0) return 100;
    return Math.round((100 - 100 / (1 + gains / losses)) * 10) / 10;
  }

  function applyEtfLiveResult(etf, res) {
    const closes = res.points.map((p) => p.close);
    const cur = res.cur;
    const prev = res.prev || cur;
    const high52 = Math.max(...closes, cur);
    const low52 = Math.min(...closes, cur);
    const mdd = Math.round(((cur - high52) / high52) * 10000) / 100;
    const rsi14 = calcBrowserRsi14(closes);
    const maSlice = closes.slice(-Math.min(200, closes.length));
    const ma200 = Math.round((maSlice.reduce((a, b) => a + b, 0) / maSlice.length) * 100) / 100;
    const ma200Diff = ma200 > 0 ? Math.round(((cur - ma200) / ma200) * 10000) / 100 : 0;

    const pos = etf.news.filter((n) => n.sentiment === 'positive').length;
    const neg = etf.news.filter((n) => n.sentiment === 'negative').length;
    const newsScore = Math.min(95, Math.max(15, 50 + (pos - neg) * 12));
    const valScore = Math.min(95, Math.max(25, Math.round(55 + Math.abs(mdd) * 2.5)));
    const techScore = rsi14 < 35 ? 86 : rsi14 < 48 ? 74 : rsi14 < 62 ? 58 : rsi14 < 72 ? 42 : 28;
    const fxBonus = 100 - state.data.fx.percentile1Y;
    const score = Math.round(valScore * 0.35 + techScore * 0.3 + newsScore * 0.2 + fxBonus * 0.15);
    const light = score >= 68 ? 'green' : score >= 48 ? 'yellow' : 'red';

    etf.price = cur;
    etf.changePct = prev > 0 ? Math.round(((cur - prev) / prev) * 10000) / 100 : 0;
    etf.high52w = Math.round(high52 * 100) / 100;
    etf.low52w = Math.round(low52 * 100) / 100;
    etf.mddFromHigh = mdd;
    etf.rsi14 = rsi14;
    etf.ma200 = ma200;
    etf.ma200DiffPct = ma200Diff;
    etf.score = score;
    etf.light = light;
    etf.actionBadge = light === 'green' ? '분할매수 유리' : light === 'yellow' ? '중립 · 분할' : '변동성 주의';

    if (etf.ticker !== 'SGOV') {
      const buyLow = Math.round(Math.max(low52, ma200 * 0.94) * 100) / 100;
      let buyHigh = Math.round(Math.min(high52 * 0.92, ma200 * 1.01) * 100) / 100;
      if (buyHigh <= buyLow) buyHigh = Math.round(buyLow * 1.04 * 100) / 100;
      const fairHigh = Math.round(Math.max(buyHigh * 1.04, high52 * 0.97) * 100) / 100;
      const zLight = cur <= buyHigh ? 'green' : cur <= fairHigh ? 'yellow' : 'red';
      etf.priceZones = {
        buyLow,
        buyHigh,
        fairHigh,
        overPrice: fairHigh,
        status: zLight === 'green' ? '적극 분할 구간' : zLight === 'yellow' ? '적정 적립 구간' : '추격 주의 구간',
        light: zLight,
        note:
          zLight === 'green'
            ? '200일선 부근 또는 고점 대비 충분히 눌린 저평가 매수 구간'
            : zLight === 'yellow'
              ? '고점 대비 과열이 식은 구간 · 정기 분할 매수에 무리 없음'
              : '52주 고점 근접 · 일괄 매수보다 눌림목 대기 권장'
      };
    }

    const step = Math.max(1, Math.floor(res.points.length / 40));
    etf.history = res.points
      .filter((_, idx2) => idx2 % step === 0 || idx2 === res.points.length - 1)
      .map((p) => ({ date: p.date, close: p.close, ma200 }));
  }

  function renderAllTabs() {
    renderOverview();
    renderEtfList();
    renderFxTab();
    renderMacroTab();
    renderPortfolioTab();
    if (state.selectedTicker) {
      const found = state.data.etfs.find((e) => e.ticker === state.selectedTicker);
      if (found) renderDrawerContent(found);
    }
  }

  async function runBrowserLiveRefresh() {
    let fxUpdated = false;
    let etfUpdatedCount = 0;

    // 1단계 (1초 이내 즉시 반영): 실시간 원/달러 환율 + 현재 누른 시각 갱신
    const liveFx = await fetchLiveUsdKrw();
    if (liveFx && liveFx > 800 && liveFx < 2500) {
      fxUpdated = true;
      const fx = state.data.fx;
      const prevFx = fx.usdKrw || liveFx;
      fx.usdKrw = liveFx;
      if (prevFx > 0 && Math.abs(liveFx - prevFx) > 0.01) {
        fx.changePct = Math.round(((liveFx - prevFx) / prevFx) * 10000) / 100;
      }
      fx.high52w = Math.max(fx.high52w, liveFx);
      fx.low52w = Math.min(fx.low52w, liveFx);
      const pct1Y = fx.high52w > fx.low52w ? Math.round(((liveFx - fx.low52w) / (fx.high52w - fx.low52w)) * 100) : fx.percentile1Y;
      fx.percentile1Y = Math.max(1, Math.min(99, pct1Y));
      fx.light = fx.percentile1Y <= 40 ? 'green' : fx.percentile1Y <= 70 ? 'yellow' : 'red';
      fx.recommendation =
        fx.light === 'green'
          ? '1년 평균보다 낮아 분할 환전에 유리해요'
          : fx.light === 'yellow'
            ? '1년 중간 구간 · 정기 분할 환전이 적합해요'
            : '1년 상단권 · 환율 부담이 커 소액 분할 권장';
      if (Array.isArray(fx.history) && fx.history.length) {
        fx.history[fx.history.length - 1] = { date: todayStr(), value: liveFx };
      }
      state.data.overview.fxSignal.light = fx.light;
      state.data.overview.fxSignal.score = 100 - fx.percentile1Y;
      state.data.overview.fxSignal.label = fx.light === 'green' ? '환전 유리' : fx.light === 'yellow' ? '분할 환전' : '환율 부담';
      state.data.overview.fxSignal.summary = `1년 중 ${fx.percentile1Y <= 40 ? '싼 편' : fx.percentile1Y <= 70 ? '보통' : '비싼 편'} (하위 ${fx.percentile1Y}%)`;
    }

    const nowKst = formatNowKst();
    state.data.meta.updatedAt = nowKst.iso;
    state.data.meta.updatedLabel = nowKst.label;
    state.data.meta.sourceMode = fxUpdated ? 'live' : state.data.meta.sourceMode;
    renderAllTabs();

    // 2단계 (빠른 프로브 1회 후 전체 병렬 조회 — 최대 5초 컷, 무한대기 방지!)
    const firstEtf = state.data.etfs[0];
    const probe = firstEtf ? await fetchYahooLiveBrowser(firstEtf.ticker, 3000) : null;
    if (probe) {
      applyEtfLiveResult(firstEtf, probe);
      etfUpdatedCount++;
      const restEtfs = state.data.etfs.slice(1);
      const [vixRes, ...restRes] = await Promise.all([
        fetchYahooLiveBrowser('^VIX', 4000),
        ...restEtfs.map((e) => fetchYahooLiveBrowser(e.ticker, 4000))
      ]);
      if (vixRes) {
        state.data.overview.marketSentiment.vix = vixRes.cur;
        const vixInd = state.data.macro.indicators.find((x) => x.id === 'vix');
        if (vixInd) {
          vixInd.value = String(vixRes.cur);
          vixInd.numValue = vixRes.cur;
          vixInd.light = vixRes.cur < 18 ? 'green' : vixRes.cur < 25 ? 'yellow' : 'red';
          vixInd.tag = vixRes.cur < 18 ? '변동성 안정' : vixRes.cur < 25 ? '경계 구간' : '변동성 확대';
        }
      }
      restRes.forEach((r, idx) => {
        if (r) {
          applyEtfLiveResult(restEtfs[idx], r);
          etfUpdatedCount++;
        }
      });
      state.data.meta.sourceMode = 'live';
      renderAllTabs();
    }

    try {
      localStorage.setItem(LIVE_CACHE_KEY, JSON.stringify(state.data));
    } catch {}

    return { fxUpdated, etfUpdatedCount, label: nowKst.label };
  }

  async function handleRefresh() {
    const btn = $('#refreshBtn');
    btn.classList.add('spinning');
    btn.disabled = true;
    showToast('지금 시각 기준으로 실시간 최신화 중...');

    try {
      await loadData(true);
      const r = await runBrowserLiveRefresh();
      if (r.etfUpdatedCount > 0) {
        showToast(`실시간 최신화 완료! (환율 + ETF ${r.etfUpdatedCount}종 · ${r.label})`);
      } else if (r.fxUpdated) {
        showToast(`실시간 환율·시각 반영 완료! (${r.label})`);
      } else {
        showToast(`최신 데이터 확인 완료 (${r.label})`);
      }
    } finally {
      btn.classList.remove('spinning');
      btn.disabled = false;
    }
  }

  function updateQrDisplay(urlText) {
    const box = $('#mobileQrBox');
    if (!box || !window.QRCodeSvg) return;
    const trimmed = String(urlText || '').trim();
    if (!trimmed) {
      box.innerHTML = '<div style="padding:30px; color:var(--ink-3); font-size:0.82rem;">주소를 입력해 주세요</div>';
      return;
    }
    try {
      box.innerHTML = window.QRCodeSvg.renderQrSvg(trimmed, 196);
    } catch {
      box.innerHTML = '<div style="padding:30px; color:var(--red); font-size:0.82rem;">주소가 너무 깁니다</div>';
    }
  }

  async function openGuideModal() {
    $('#guideModalBackdrop').classList.add('open');
    $('#guideModalBackdrop').setAttribute('aria-hidden', 'false');
    let targetUrl = location.origin && location.protocol.startsWith('http') ? location.href.split('?')[0] : 'http://localhost:8080';
    try {
      if (location.protocol !== 'file:') {
        const res = await fetch('/api/info');
        if (res.ok) {
          const info = await res.json();
          targetUrl = info.mobileUrl;
        }
      }
    } catch {}
    const input = $('#qrUrlInput');
    if (input) input.value = targetUrl;
    updateQrDisplay(targetUrl);
  }

  function closeGuideModal() {
    $('#guideModalBackdrop').classList.remove('open');
    $('#guideModalBackdrop').setAttribute('aria-hidden', 'true');
  }

  function bindEvents() {
    $$('.nav-btn, .m-tab[data-tab]').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
    $('#brandHome').addEventListener('click', () => switchTab('dashboard'));
    $('#themeToggle').addEventListener('click', toggleTheme);
    $('#refreshBtn').addEventListener('click', handleRefresh);
    $('#mobileGuideBtn').addEventListener('click', openGuideModal);

    // 내 투자 서브탭 및 JSON 백업/복원
    $$('#portfolioSubTabs .seg-btn').forEach((b) => {
      b.addEventListener('click', () => {
        state.portfolioSub = b.dataset.sub;
        renderPortfolioTab();
      });
    });

    $('#exportJournalBtn').addEventListener('click', () => {
      const payload = JSON.stringify({ buyLogs: state.buyLogs, fxLogs: state.fxLogs, favs: state.favs }, null, 2);
      const blob = new Blob([payload], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `gemini-econ-journal-${todayStr()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      showToast('매수·환전 일지 백업 파일을 저장했어요.');
    });

    $('#importJournalBtn').addEventListener('click', () => $('#importJournalFile').click());
    $('#importJournalFile').addEventListener('change', (ev) => {
      const file = ev.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result));
          if (window.SimpleShare) {
            const mb = window.SimpleShare.mergeLogs(state.buyLogs, parsed.buyLogs || [], 'buy');
            const mf = window.SimpleShare.mergeLogs(state.fxLogs, parsed.fxLogs || [], 'fx');
            state.buyLogs = mb.merged;
            state.fxLogs = mf.merged;
            saveBuyLogs();
            saveFxLogs();
            showToast(`일지 ${mb.added + mf.added}건을 합쳤어요!`);
          } else {
            if (Array.isArray(parsed.buyLogs)) { state.buyLogs = parsed.buyLogs; saveBuyLogs(); }
            if (Array.isArray(parsed.fxLogs)) { state.fxLogs = parsed.fxLogs; saveFxLogs(); }
            showToast('백업한 일지를 복원했어요.');
          }
          if (Array.isArray(parsed.favs)) { state.favs = parsed.favs; localStorage.setItem(FAV_KEY, JSON.stringify(state.favs)); }
          renderEtfList();
          renderPortfolioTab();
        } catch {
          showToast('올바른 백업 JSON 파일이 아닙니다.');
        }
      };
      reader.readAsText(file);
      ev.target.value = '';
    });

    $('#drawerFavBtn').addEventListener('click', () => {
      if (state.selectedTicker) toggleFav(state.selectedTicker);
    });
    $('#closeDrawerBtn').addEventListener('click', closeEtfDrawer);
    $('#etfModalBackdrop').addEventListener('click', (e) => {
      if (e.target === $('#etfModalBackdrop')) closeEtfDrawer();
    });

    $('#closeGuideBtn').addEventListener('click', closeGuideModal);
    $('#guideModalBackdrop').addEventListener('click', (e) => {
      if (e.target === $('#guideModalBackdrop')) closeGuideModal();
    });

    // 작성자 별명 설정 & 공유 수신 모달 이벤트
    $('#closeShareBtn').addEventListener('click', closeShareModal);
    $('#shareModalBackdrop').addEventListener('click', (e) => {
      if (e.target === $('#shareModalBackdrop')) closeShareModal();
    });
    $('#nickSettingsForm').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const nick = ($('#authorNicknameInput').value || '').trim() || '나';
      state.authorNick = window.SimpleShare ? window.SimpleShare.saveNickname(nick) : nick;
      closeShareModal();
      renderPortfolioTab();
      showToast(`내 별명을 [${state.authorNick}] 로 저장했어요.`);
    });

    const closeRecvBtn = $('#closeReceiveShareBtn');
    if (closeRecvBtn) closeRecvBtn.addEventListener('click', closeReceiveShareModal);
    const recvBackdrop = $('#receiveShareBackdrop');
    if (recvBackdrop) {
      recvBackdrop.addEventListener('click', (e) => {
        if (e.target === recvBackdrop) closeReceiveShareModal();
      });
    }

    const qrInput = $('#qrUrlInput');
    if (qrInput) {
      qrInput.addEventListener('input', (e) => updateQrDisplay(e.target.value));
    }

    $('#copyMobileUrlBtn').addEventListener('click', async () => {
      try {
        const val = ($('#qrUrlInput')?.value || '').trim();
        await navigator.clipboard.writeText(val);
        showToast('접속 주소를 복사했어요.');
      } catch {
        showToast('주소를 직접 선택해 복사해 주세요.');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeEtfDrawer();
        closeGuideModal();
        closeShareModal();
        closeReceiveShareModal();
      }
    });

    $('#etfSearchInput').addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      renderEtfList();
    });

    $('#etfSortSelect').addEventListener('change', (e) => {
      state.sortBy = e.target.value;
      renderEtfList();
    });

    $$('#categoryFilters .pill').forEach((p) => {
      p.addEventListener('click', () => {
        state.category = p.dataset.category;
        $$('#categoryFilters .pill').forEach((x) => x.classList.toggle('active', x === p));
        renderEtfList();
      });
    });

    $$('#signalFilters .seg-btn').forEach((b) => {
      b.addEventListener('click', () => {
        state.lightFilter = b.dataset.light;
        $$('#signalFilters .seg-btn').forEach((x) => x.classList.toggle('active', x === b));
        renderEtfList();
      });
    });

    $$('#macroNewsFilter .seg-btn').forEach((b) => {
      b.addEventListener('click', () => {
        state.macroNewsFilter = b.dataset.sent;
        $$('#macroNewsFilter .seg-btn').forEach((x) => x.classList.toggle('active', x === b));
        if (state.data) renderGlobalNews(state.data.macro.globalNews);
      });
    });

    const toggleAllBtn = $('#toggleAllNewsBtn');
    if (toggleAllBtn) {
      toggleAllBtn.addEventListener('click', () => {
        const items = $$('#globalNewsList .news-digest-item');
        const allOpen = items.length > 0 && items.every((el) => el.open);
        items.forEach((el) => { el.open = !allOpen; });
        toggleAllBtn.textContent = allOpen ? '전체 펼치기' : '전체 접기';
      });
    }
  }

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }

  initTheme();
  bindEvents();
  loadData();
})();
