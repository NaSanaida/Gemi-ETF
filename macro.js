/**
 * 미국 핵심 경제지표 상세 분석 페이지 (새 탭 전용)
 */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (str) =>
    String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  let marketData = null;
  const params = new URLSearchParams(location.search);
  let currentId = params.get('id') || 'gdp';
  const fromTab = params.get('from') || 'macro';

  function bindBackButton() {
    const btn = $('#backToMacroBtn');
    const lbl = $('#backBtnLabel');
    if (lbl) lbl.textContent = fromTab === 'dashboard' ? '제미나이 경제' : '핵심 경제지표';
    if (btn) {
      btn.addEventListener('click', () => {
        if (document.referrer && document.referrer.includes('index.html') && history.length > 1) {
          history.back();
        } else {
          location.href = `./index.html?tab=${encodeURIComponent(fromTab)}`;
        }
      });
    }
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
    applyTheme(localStorage.getItem('etf_pulse_theme_v2') || 'light');
    $('#themeToggle').addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      localStorage.setItem('etf_pulse_theme_v2', next);
      applyTheme(next);
    });
  }

  // 기준선 포함 인터랙티브 경제지표 추이 SVG 그래프
  function mountMacroChart(containerEl, ind) {
    const pts = ind.history || [];
    if (!containerEl || pts.length < 2) return;

    const vals = pts.map((p) => Number(p.value));
    const hasTarget = typeof ind.targetLine === 'number';
    const all = hasTarget ? [...vals, ind.targetLine] : vals;
    const rawMin = Math.min(...all);
    const rawMax = Math.max(...all);
    const padSpan = (rawMax - rawMin || 1) * 0.16;
    const min = rawMin - padSpan;
    const max = rawMax + padSpan;
    const span = max - min || 1;

    const color = ind.light === 'green' ? '#00c471' : ind.light === 'red' ? '#f04452' : '#ff9f0a';
    const unit = ind.unit === 'pt' ? '' : ind.unit || '';

    const W = 720;
    const H = 230;
    const padL = 54;
    const padR = 20;
    const padT = 18;
    const padB = 30;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const gx = (i) => padL + (i / (pts.length - 1)) * plotW;
    const gy = (v) => padT + (1 - (v - min) / span) * plotH;

    const coords = pts.map((p, i) => `${gx(i).toFixed(1)},${gy(p.value).toFixed(1)}`);
    const areaD = `M ${gx(0).toFixed(1)},${(padT + plotH).toFixed(1)} L ${coords.join(' L ')} L ${gx(pts.length - 1).toFixed(1)},${(padT + plotH).toFixed(1)} Z`;

    let gridSvg = '';
    for (let g = 0; g <= 3; g++) {
      const r = g / 3;
      const y = padT + r * plotH;
      const lv = max - r * span;
      gridSvg += `
        <line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" stroke="currentColor" stroke-opacity="0.08" stroke-width="1" />
        <text x="${padL - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" fill="#8b95a1" font-size="11">${lv.toFixed(lv < 10 ? 1 : 0)}${unit}</text>
      `;
    }

    let targetSvg = '';
    if (hasTarget) {
      const ty = gy(ind.targetLine);
      targetSvg = `
        <line x1="${padL}" y1="${ty.toFixed(1)}" x2="${W - padR}" y2="${ty.toFixed(1)}" stroke="#3182f6" stroke-width="1.5" stroke-dasharray="5 4" />
        <text x="${W - padR - 4}" y="${(ty - 6).toFixed(1)}" text-anchor="end" fill="#3182f6" font-size="11" font-weight="700">${esc(ind.targetLabel || '기준선')}</text>
      `;
    }

    const maxIdx = vals.indexOf(Math.max(...vals));
    const minIdx = vals.indexOf(Math.min(...vals));
    const dotsSvg = pts
      .map((p, i) => {
        const isLast = i === pts.length - 1;
        const cx = gx(i).toFixed(1);
        const cy = gy(p.value).toFixed(1);
        let valTag = '';
        if (isLast || i === maxIdx || i === minIdx) {
          const dy = i === minIdx && !isLast ? 15 : -9;
          const anchor = isLast ? 'end' : i === 0 ? 'start' : 'middle';
          valTag = `<text x="${cx}" y="${(Number(cy) + dy).toFixed(1)}" text-anchor="${anchor}" fill="${isLast ? color : '#4e5968'}" font-size="11" font-weight="${isLast ? '800' : '700'}">${p.value}${unit}</text>`;
        }
        return `<circle cx="${cx}" cy="${cy}" r="${isLast ? 5.5 : 3.2}" fill="${color}" stroke="#fff" stroke-width="${isLast ? 2.2 : 1.4}" />${valTag}`;
      })
      .join('');

    const step = Math.max(1, Math.floor(pts.length / 5));
    const xSvg = pts
      .map((p, i) => {
        if (i !== 0 && i !== pts.length - 1 && i % step !== 0) return '';
        const anchor = i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle';
        return `<text x="${gx(i).toFixed(1)}" y="${H - 7}" text-anchor="${anchor}" fill="#8b95a1" font-size="11">${esc(p.date)}</text>`;
      })
      .join('');

    const gid = `mg_${ind.id}`;
    containerEl.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" style="display:block; touch-action:pan-y;">
        <defs>
          <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${color}" stop-opacity="0.18" />
            <stop offset="100%" stop-color="${color}" stop-opacity="0.01" />
          </linearGradient>
        </defs>
        ${gridSvg}
        <path d="${areaD}" fill="url(#${gid})" />
        ${targetSvg}
        <polyline fill="none" stroke="${color}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" points="${coords.join(' ')}" />
        ${dotsSvg}
        <line class="h-line" x1="0" y1="${padT}" x2="0" y2="${padT + plotH}" stroke="#8b95a1" stroke-dasharray="3 3" style="display:none;" />
        ${xSvg}
      </svg>
      <div class="chart-tooltip"></div>
    `;

    const svg = $('svg', containerEl);
    const hLine = $('.h-line', svg);
    const tip = $('.chart-tooltip', containerEl);

    const onMove = (clientX) => {
      const rect = svg.getBoundingClientRect();
      const relX = ((clientX - rect.left) / rect.width) * W;
      const ratio = Math.max(0, Math.min(1, (relX - padL) / plotW));
      const idx = Math.round(ratio * (pts.length - 1));
      const pt = pts[idx];
      const cx = gx(idx);
      const cy = gy(pt.value);

      hLine.setAttribute('x1', cx);
      hLine.setAttribute('x2', cx);
      hLine.style.display = 'block';
      tip.innerHTML = `${esc(pt.date)} · <strong>${pt.value}${unit}</strong>`;
      tip.style.display = 'block';

      const pxX = (cx / W) * rect.width;
      const pxY = (cy / H) * rect.height;
      const leftSide = pxX > rect.width * 0.65;
      tip.style.left = `${leftSide ? Math.max(6, pxX - tip.offsetWidth - 10) : pxX + 10}px`;
      tip.style.top = `${Math.max(4, pxY - 24)}px`;
    };

    const onLeave = () => {
      hLine.style.display = 'none';
      tip.style.display = 'none';
    };

    svg.addEventListener('mousemove', (e) => onMove(e.clientX));
    svg.addEventListener('mouseleave', onLeave);
    svg.addEventListener('touchmove', (e) => {
      if (e.touches[0]) onMove(e.touches[0].clientX);
    }, { passive: true });
    svg.addEventListener('touchend', onLeave);
  }

  function renderSwitcher() {
    const inds = marketData.macro.indicators;
    $('#macroSwitcher').innerHTML = inds
      .map(
        (ind) => `
      <button class="pill ${ind.id === currentId ? 'active' : ''}" type="button" data-id="${ind.id}">
        <i class="sdot ${ind.light}" style="margin-right:4px; vertical-align:middle;"></i>${esc(ind.name)}
      </button>
    `
      )
      .join('');

    $('#macroSwitcher').querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        currentId = btn.dataset.id;
        history.replaceState(null, '', `./macro.html?id=${encodeURIComponent(currentId)}&from=${encodeURIComponent(fromTab)}`);
        renderSwitcher();
        renderDetail();
      });
    });
  }

  function renderDetail() {
    const ind = marketData.macro.indicators.find((x) => x.id === currentId) || marketData.macro.indicators[0];
    document.title = `${ind.name} 상세 분석 — 제미나이 경제`;
    $('#macroUpdatedLabel').textContent = marketData.meta.updatedLabel;

    const unit = ind.unit === 'pt' ? '' : ind.unit || '';
    const histVals = (ind.history || []).map((p) => Number(p.value));
    const maxVal = histVals.length ? Math.max(...histVals) : ind.numValue;
    const minVal = histVals.length ? Math.min(...histVals) : ind.numValue;
    const diffTarget = typeof ind.targetLine === 'number' && typeof ind.numValue === 'number' ? +(ind.numValue - ind.targetLine).toFixed(2) : null;
    const diffText =
      diffTarget === null
        ? '-'
        : `${diffTarget > 0 ? '+' : ''}${diffTarget}${ind.unit === '%' ? '%p' : ''}`;

    const benChips = (ind.beneficiaries?.tickers || [])
      .map((t) => `<a class="etf-chip" href="./index.html?etf=${t}&tab=dashboard" style="text-decoration:none;">${t} 보기 →</a>`)
      .join(' ');
    const preChips = (ind.pressured?.tickers || [])
      .map((t) => `<a class="etf-chip red-chip" href="./index.html?etf=${t}&tab=dashboard" style="text-decoration:none;">${t} 보기 →</a>`)
      .join(' ');

    $('#macroDetailRoot').innerHTML = `
      <!-- 1. 결론 & 대형 추이 그래프 -->
      <div class="surface">
        <div class="hero-eyebrow">
          <span class="eyebrow-text">${esc(ind.name)} · ${esc(ind.period)}</span>
          <span class="status-pill ${ind.light}"><i class="sdot ${ind.light}"></i>${esc(ind.tag)}</span>
        </div>

        <div style="display:flex; align-items:baseline; gap:12px; flex-wrap:wrap; margin-bottom:8px;">
          <span class="fx-rate-big num">${esc(ind.value)}</span>
          <span class="num" style="font-size:0.9rem; font-weight:700; color:var(--ink-2);">직전 ${esc(ind.prev)} (${esc(ind.delta || '-')})</span>
        </div>
        <h1 class="hero-headline" style="font-size:1.18rem; margin-bottom:18px;">${esc(ind.verdictHeadline || ind.impact)}</h1>

        <div class="chart-stage" id="macroChartStage" style="height:230px;"></div>

        <div class="kpi-trio num">
          <div class="kpi-item">
            <span>기간 최고</span>
            <strong>${maxVal}${unit}</strong>
          </div>
          <div class="kpi-item">
            <span>기간 최저</span>
            <strong>${minVal}${unit}</strong>
          </div>
          <div class="kpi-item">
            <span>기준선(${ind.targetLine}${unit}) 대비</span>
            <strong style="color:${ind.light === 'red' ? 'var(--red)' : 'var(--green)'}">${diffText}</strong>
          </div>
        </div>

        <div class="next-release-bar">
          <strong>다음 발표 일정</strong>
          <span>${esc(ind.nextRelease || '정기 일정 확인')}</span>
        </div>
      </div>

      <!-- 2. 구간별 판단 기준표 (3초 이해) -->
      <div class="surface">
        <div class="list-header" style="margin-bottom:12px;">
          <div>
            <h2 class="section-title">구간별 해석 기준</h2>
            <p class="section-sub">현재 수치가 어느 구간인지 한눈에 확인하세요</p>
          </div>
        </div>
        <div class="plan-list">
          ${(ind.zones || [])
            .map(
              (z) => `
            <div class="plan-row ${z.current ? 'active' : ''}">
              <div>
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                  <strong style="font-size:0.92rem;">${esc(z.range)}</strong>
                  <span class="status-pill ${z.light}"><i class="sdot ${z.light}"></i>${esc(z.status)}</span>
                  ${z.current ? '<span class="status-pill" style="background:var(--blue); color:#fff;">현재 위치</span>' : ''}
                </div>
                <div style="font-size:0.83rem; color:var(--ink-2); margin-top:4px;">${esc(z.meaning)}</div>
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      </div>

      <!-- 3. 내 ETF에 미치는 영향 -->
      <div class="surface">
        <div class="list-header" style="margin-bottom:12px;">
          <div>
            <h2 class="section-title">ETF별 영향 (수혜 vs 부담)</h2>
            <p class="section-sub">종목을 누르면 해당 ETF 신호등 상세로 바로 이동합니다</p>
          </div>
        </div>
        <div class="pros-cons" style="margin-bottom:0;">
          <div class="pc-box">
            <h4><i class="sdot green"></i> 유리한 ETF</h4>
            <p style="margin:0 0 10px; font-size:0.82rem; color:var(--ink-2);">${esc(ind.beneficiaries?.reason || '')}</p>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">${benChips}</div>
          </div>
          <div class="pc-box">
            <h4><i class="sdot red"></i> 부담되는 ETF</h4>
            <p style="margin:0 0 10px; font-size:0.82rem; color:var(--ink-2);">${esc(ind.pressured?.reason || '')}</p>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">${preChips}</div>
          </div>
        </div>
      </div>

      <!-- 4. 지금 투자자 행동 체크 3가지 -->
      <div class="surface">
        <div class="list-header" style="margin-bottom:12px;">
          <h2 class="section-title">지금 투자자 체크 3가지</h2>
        </div>
        <ol class="action-checklist">
          ${(ind.actionChecklist || []).map((line) => `<li>${esc(line)}</li>`).join('')}
        </ol>
      </div>
    `;

    mountMacroChart($('#macroChartStage'), ind);
  }

  async function init() {
    initTheme();
    bindBackButton();
    try {
      const res = await fetch('./data/market-data.json', { cache: 'no-store' });
      marketData = res.ok ? await res.json() : window.MARKET_DATA;
    } catch {
      marketData = window.MARKET_DATA;
    }
    if (!marketData) return;
    renderSwitcher();
    renderDetail();
  }

  init();
})();
