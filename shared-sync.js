/**
 * 제미나이 경제 — 무인증·무서버 초간단 공동 일지 공유 모듈
 * 로그인/서버 설정 없이 별명 자동 표시 + 압축 공유 링크 1클릭 병합
 */
(() => {
  'use strict';

  const NICK_KEY = 'etf_pulse_author_nick_v1';

  function loadNickname() {
    const saved = (localStorage.getItem(NICK_KEY) || '').trim();
    return saved || '나';
  }

  function saveNickname(nick) {
    const clean = String(nick || '').trim().slice(0, 16) || '나';
    localStorage.setItem(NICK_KEY, clean);
    return clean;
  }

  // 작성자별 고유 차분한 파스텔 배지 색상
  const AUTHOR_PALETTE = [
    { bg: '#e8f3ff', fg: '#1b64da' },
    { bg: '#e6f8f0', fg: '#028a56' },
    { bg: '#f3ecff', fg: '#6d28d9' },
    { bg: '#fff4e0', fg: '#b46900' },
    { bg: '#ffeded', fg: '#d63031' },
    { bg: '#e0f7fa', fg: '#00798c' }
  ];

  function getAuthorStyle(name) {
    const str = String(name || '나');
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
    return AUTHOR_PALETTE[hash % AUTHOR_PALETTE.length];
  }

  // Base64URL 유틸
  function bytesToB64Url(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function b64UrlToBytes(str) {
    const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
    const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function compressBytes(raw) {
    if (typeof CompressionStream === 'undefined') return null;
    try {
      const cs = new CompressionStream('deflate-raw');
      const w = cs.writable.getWriter();
      w.write(raw);
      w.close();
      const buf = await new Response(cs.readable).arrayBuffer();
      return new Uint8Array(buf);
    } catch {
      return null;
    }
  }

  async function decompressBytes(compressed) {
    if (typeof DecompressionStream === 'undefined') return null;
    try {
      const ds = new DecompressionStream('deflate-raw');
      const w = ds.writable.getWriter();
      w.write(compressed);
      w.close();
      const buf = await new Response(ds.readable).arrayBuffer();
      return new Uint8Array(buf);
    } catch {
      return null;
    }
  }

  // URL 길이를 최소화하기 위한 콤팩트 배열 직렬화
  function packPayload(senderName, buyLogs, fxLogs) {
    return {
      v: 1,
      s: String(senderName || '나').slice(0, 16),
      b: (buyLogs || []).slice(-60).map((x) => [
        x.id || '',
        x.date || '',
        x.ticker || '',
        Number(x.price) || 0,
        Number(x.qty) || 0,
        Number(x.fxRate) || 1350,
        String(x.memo || '').slice(0, 50),
        String(x.author || senderName || '나').slice(0, 16)
      ]),
      f: (fxLogs || []).slice(-60).map((x) => [
        x.id || '',
        x.date || '',
        Number(x.krw) || 0,
        Number(x.rate) || 1350,
        Number(x.usd) || 0,
        String(x.memo || '').slice(0, 50),
        String(x.author || senderName || '나').slice(0, 16)
      ])
    };
  }

  function unpackPayload(obj) {
    if (!obj || typeof obj !== 'object') return null;
    const sender = String(obj.s || '지인').slice(0, 16);
    const buyLogs = Array.isArray(obj.b)
      ? obj.b.map((a, idx) => ({
          id: a[0] || `sb_${Date.now()}_${idx}`,
          date: String(a[1] || ''),
          ticker: String(a[2] || ''),
          price: Number(a[3]) || 0,
          qty: Number(a[4]) || 0,
          fxRate: Number(a[5]) || 1350,
          memo: String(a[6] || ''),
          author: String(a[7] || sender)
        })).filter((x) => x.ticker && x.qty > 0)
      : [];
    const fxLogs = Array.isArray(obj.f)
      ? obj.f.map((a, idx) => ({
          id: a[0] || `sf_${Date.now()}_${idx}`,
          date: String(a[1] || ''),
          krw: Number(a[2]) || 0,
          rate: Number(a[3]) || 1350,
          usd: Number(a[4]) || 0,
          memo: String(a[5] || ''),
          author: String(a[6] || sender)
        })).filter((x) => x.krw > 0 && x.rate > 0)
      : [];
    return { sender, buyLogs, fxLogs };
  }

  async function encodeShareToken(senderName, buyLogs, fxLogs) {
    const json = JSON.stringify(packPayload(senderName, buyLogs, fxLogs));
    const raw = new TextEncoder().encode(json);
    const zipped = await compressBytes(raw);
    if (zipped && zipped.length < raw.length) {
      return `z.${bytesToB64Url(zipped)}`;
    }
    return `p.${bytesToB64Url(raw)}`;
  }

  async function decodeShareToken(token) {
    try {
      const str = String(token || '').trim();
      if (!str || str.length < 4) return null;
      let bytes = null;
      if (str.startsWith('z.')) {
        bytes = await decompressBytes(b64UrlToBytes(str.slice(2)));
      } else if (str.startsWith('p.')) {
        bytes = b64UrlToBytes(str.slice(2));
      } else {
        bytes = b64UrlToBytes(str);
      }
      if (!bytes) return null;
      const json = new TextDecoder().decode(bytes);
      return unpackPayload(JSON.parse(json));
    } catch {
      return null;
    }
  }

  // 기존 내역 + 받은 내역을 ID / 내용 기준으로 중복 없이 병합
  function mergeLogs(existingList, incomingList, type) {
    const existing = Array.isArray(existingList) ? [...existingList] : [];
    const seenIds = new Set(existing.map((x) => x.id).filter(Boolean));
    const seenFingerprints = new Set(
      existing.map((x) =>
        type === 'buy'
          ? `${x.date}|${x.ticker}|${x.price}|${x.qty}|${x.author || ''}`
          : `${x.date}|${x.krw}|${x.rate}|${x.author || ''}`
      )
    );
    let added = 0;
    for (const item of incomingList || []) {
      const fp =
        type === 'buy'
          ? `${item.date}|${item.ticker}|${item.price}|${item.qty}|${item.author || ''}`
          : `${item.date}|${item.krw}|${item.rate}|${item.author || ''}`;
      if ((item.id && seenIds.has(item.id)) || seenFingerprints.has(fp)) continue;
      existing.push(item);
      if (item.id) seenIds.add(item.id);
      seenFingerprints.add(fp);
      added++;
    }
    return { merged: existing, added };
  }

  window.SimpleShare = {
    loadNickname,
    saveNickname,
    getAuthorStyle,
    encodeShareToken,
    decodeShareToken,
    mergeLogs
  };
})();
