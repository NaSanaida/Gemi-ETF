/**
 * 미국 ETF 신호등 — 토스증권 · 카카오 스타일 16종 ETF 의사결정 대시보드
 */
(() => {
  'use strict';

  const FAV_KEY = 'etf_pulse_favs_v1';
  const loadFavs = () => {
    try {
      const arr = JSON.parse(localStorage.getItem(FAV_KEY) || '["SPLG","QQQM","SCHD","SGOV"]');
      return Array.isArray(arr) ? arr : [];
    } catch {
      return ['SPLG', 'QQQM', 'SCHD', 'SGOV'];
    }
  };

  const state = {
    data: null,
    activeTab: 'dashboard',
    category: '전체',
    lightFilter: 'all',
    searchQuery: '',
    sortBy: 'score',
    macroNewsFilter: 'all',
    selectedTicker: null,
    drawerNewsFilter: 'all',
    drawerChartRange: '1Y',
    favs: loadFavs()
  };

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

  // ==================== 1. 오늘의 결론 & 목적별 빠른 선택 ====================
  function renderOverview() {
    const { meta, overview, fx, macro } = state.data;
    $('#updatedLabel').textContent = meta.updatedLabel;
    $('#sourceModeBadge').textContent = meta.sourceMode === 'live' ? '실시간 반영됨' : '데일리 브리핑';
    $('#heroHeadline').textContent = overview.headline || '오늘의 미국 ETF 투자 신호등을 확인하세요.';

    const cpiInd = macro.indicators.find((i) => i.id === 'cpi');

    const cells = [
      {
        tab: 'fx',
        label: '1. 환전',
        light: overview.fxSignal.light,
        badge: overview.fxSignal.label,
        val: `${fx.usdKrw.toLocaleString('ko-KR')}원`,
        sub: overview.fxSignal.summary
      },
      {
        tab: 'macro-vix',
        label: '2. 시장 심리',
        light: overview.marketSentiment.light,
        badge: overview.marketSentiment.label,
        val: `공포 ${overview.marketSentiment.fearGreed}`,
        sub: `VIX ${overview.marketSentiment.vix} · 그래프 ↗`
      },
      {
        tab: 'macro',
        label: '3. 미국 경기',
        light: overview.macroSignal.light,
        badge: overview.macroSignal.label,
        val: `물가 ${cpiInd ? cpiInd.value : '-'}`,
        sub: `${overview.macroSignal.summary} →`
      }
    ];

    $('#overviewSignals').innerHTML = cells
      .map(
        (c) => `
      <button class="logic-cell" type="button" data-goto="${c.tab}">
        <div class="logic-top">
          <span class="logic-label">${c.label}</span>
          <span class="status-pill ${c.light}"><i class="sdot ${c.light}"></i>${esc(c.badge)}</span>
        </div>
        <div class="logic-val num">${c.val}</div>
        <div class="logic-sub">${esc(c.sub)}</div>
      </button>
    `
      )
      .join('');

    $$('.logic-cell').forEach((btn) => {
      btn.addEventListener('click', () => {
        const t = btn.dataset.goto;
        if (t === 'macro-vix') location.href = './macro.html?id=vix&from=dashboard';
        else if (t && t !== 'dashboard') switchTab(t);
      });
    });

    // 목적별 빠른 선택 (3분류 퀵픽)
    const picks = overview.quickPicks || [];
    $('#quickPickGrid').innerHTML = picks
      .map(
        (p) => `
      <div class="quick-pick-card">
        <div class="qp-head">
          <span class="qp-title"><i class="sdot ${p.light}"></i>${esc(p.title)}</span>
          <span class="qp-note">${esc(p.note)}</span>
        </div>
        <div class="qp-chips">
          ${p.tickers.map((tk) => `<button class="etf-chip ${p.light === 'red' ? 'red-chip' : ''}" type="button" data-quick-etf="${tk}">${tk}</button>`).join('')}
        </div>
      </div>
    `
      )
      .join('');

    $$('[data-quick-etf]').forEach((btn) => {
      btn.addEventListener('click', () => openEtfDrawer(btn.dataset.quickEtf));
    });

    $('#dailyBriefingList').innerHTML = overview.dailyBriefing
      .map((line) => {
        const idx = line.indexOf(':');
        if (idx > 0 && idx < 12) {
          return `<li><span class="summary-tag">${esc(line.slice(0, idx))}</span><span>${esc(line.slice(idx + 1).trim())}</span></li>`;
        }
        return `<li><span>${esc(line)}</span></li>`;
      })
      .join('');
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

    $('#drawerTickerTitle').textContent = `${etf.krName} (${etf.ticker})`;
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

    const body = $('#drawerBody');
    body.innerHTML = `
      <!-- 1. 결론 + 실행 전략 3칸 + 5가지 꼼꼼 체크 -->
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

        ${etf.compareTip ? `<div class="compare-tip"><strong>선택 팁</strong><span>${esc(etf.compareTip)}</span></div>` : ''}

        <div class="explain-title" style="margin-top:16px;">왜 이 신호인가요? (5가지 핵심 체크)</div>
        <div class="explain-rows">
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
          <strong style="font-size:0.95rem;">주가 흐름 (점선: 200일 평균)</strong>
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
        .map((n) => {
          const sm = sentimentMeta(n.sentiment);
          const isBb = String(n.source || '').toLowerCase().includes('bloomberg');
          return `
          <article class="news-item">
            <div class="news-top">
              <div style="display:flex; align-items:center; gap:6px;">
                <span class="status-pill ${sm.cls}"><i class="sdot ${sm.cls}"></i>${sm.label}</span>
                ${isBb ? '<span class="bb-badge">Bloomberg</span>' : ''}
              </div>
              <span class="news-meta">${esc(n.source)} · ${esc(n.publishedAt)}</span>
            </div>
            <h4 class="news-title">
              <a class="news-title-link" href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">
                ${esc(n.title)}<span class="ext-arrow" aria-hidden="true">↗</span>
              </a>
            </h4>
            <p class="news-impact">${esc(n.summary)}</p>
          </article>
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
    const { indicators, globalNews, calendar } = state.data.macro;

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
        <div class="macro-open-hint">그래프 · 상세 분석 →</div>
      </a>
    `
      )
      .join('');

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
      .map((n) => {
        const sm = sentimentMeta(n.sentiment);
        const isBb = String(n.source || '').toLowerCase().includes('bloomberg');
        const chips = (n.affectedEtfs || []).map((t) => `<button class="etf-chip" type="button" data-open="${t}">${t}</button>`).join(' ');
        return `
        <article class="news-item">
          <div class="news-top">
            <div style="display:flex; align-items:center; gap:6px;">
              <span class="status-pill ${sm.cls}"><i class="sdot ${sm.cls}"></i>${sm.label}</span>
              ${isBb ? '<span class="bb-badge">Bloomberg</span>' : ''}
            </div>
            <span class="news-meta">${esc(n.source)} · ${esc(n.publishedAt)}</span>
          </div>
          <h4 class="news-title">
            <a class="news-title-link" href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">
              ${esc(n.title)}<span class="ext-arrow" aria-hidden="true">↗</span>
            </a>
          </h4>
          <p class="news-impact">${esc(n.summary)}</p>
          <div class="news-bottom">
            <div style="display:flex; align-items:center; gap:5px; flex-wrap:wrap;">${chips}</div>
          </div>
        </article>
      `;
      })
      .join('');

    $$('[data-open]', wrap).forEach((btn) => {
      btn.addEventListener('click', () => openEtfDrawer(btn.dataset.open));
    });
  }

  // ==================== 탭 · 테마 · 데이터 로드 ====================
  function switchTab(tab, updateUrl = true) {
    const valid = ['dashboard', 'fx', 'macro'].includes(tab) ? tab : 'dashboard';
    state.activeTab = valid;
    $$('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${valid}`));
    $$('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === valid));
    $$('.m-tab[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === valid));
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
      const res = await fetch(`./data/market-data.json${bust ? `?t=${Date.now()}` : ''}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('fetch err');
      state.data = await res.json();
    } catch {
      if (window.MARKET_DATA) state.data = window.MARKET_DATA;
      else return showToast('데이터를 불러오지 못했습니다.');
    }
    renderOverview();
    renderEtfList();
    renderFxTab();
    renderMacroTab();

    // URL 파라미터 ?tab=macro 및 ?etf=QQQM 처리
    const urlParams = new URLSearchParams(location.search);
    const tabParam = urlParams.get('tab');
    if (tabParam && ['dashboard', 'fx', 'macro'].includes(tabParam)) {
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

  async function handleRefresh() {
    const btn = $('#refreshBtn');
    btn.classList.add('spinning');
    btn.disabled = true;
    showToast('최신 시세와 뉴스를 확인하는 중입니다...');
    try {
      if (location.protocol === 'file:') throw new Error('file');
      const res = await fetch('/api/refresh', { method: 'POST' });
      if (!res.ok) throw new Error('noapi');
      await loadData(true);
      showToast('최신 데이터로 업데이트했어요.');
    } catch (e) {
      if (e.message === 'file') showToast('start.bat으로 실행하면 실시간 최신화가 동작합니다.');
      else {
        await loadData(true);
        showToast('저장된 최신 데이터를 다시 불러왔어요.');
      }
    } finally {
      btn.classList.remove('spinning');
      btn.disabled = false;
    }
  }

  async function openGuideModal() {
    $('#guideModalBackdrop').classList.add('open');
    $('#guideModalBackdrop').setAttribute('aria-hidden', 'false');
    try {
      if (location.protocol !== 'file:') {
        const res = await fetch('/api/info');
        if (res.ok) {
          const info = await res.json();
          $('#mobileAccessUrl').textContent = info.mobileUrl;
        }
      }
    } catch {}
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
    $('#mobileGuideTab').addEventListener('click', openGuideModal);

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

    $('#copyMobileUrlBtn').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText($('#mobileAccessUrl').textContent.trim());
        showToast('접속 주소를 복사했어요.');
      } catch {
        showToast('주소를 직접 선택해 복사해 주세요.');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeEtfDrawer();
        closeGuideModal();
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
  }

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }

  initTheme();
  bindEvents();
  loadData();
})();
