/**
 * 외부 라이브러리/인터넷 없이 브라우저에서 즉시 ISO/IEC 18004 표준 QR 코드(SVG)를 생성하는 경량 모듈
 * Version 1~15 (Error Correction Level L, 최대 520바이트 URL·공유 링크 지원)
 */
(() => {
  'use strict';

  // GF(256) 로그/지수 테이블 (원시 다항식 0x11D)
  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];

  function gfMul(a, b) {
    return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]];
  }

  function rsGeneratorPoly(ecLen) {
    let poly = [1];
    for (let i = 0; i < ecLen; i++) {
      const next = new Array(poly.length + 1).fill(0);
      const factor = EXP[i];
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= gfMul(poly[j], factor);
      }
      poly = next;
    }
    return poly;
  }

  function rsEncode(data, ecLen) {
    const gen = rsGeneratorPoly(ecLen);
    const buf = new Uint8Array(data.length + ecLen);
    buf.set(data);
    for (let i = 0; i < data.length; i++) {
      const coef = buf[i];
      if (coef !== 0) {
        for (let j = 0; j < gen.length; j++) {
          buf[i + j] ^= gfMul(gen[j], coef);
        }
      }
    }
    return buf.slice(data.length);
  }

  // ISO/IEC 18004 Table 9 — EC Level L (Version 1~15)
  // g1: [블록 수, 블록당 데이터 바이트], g2: [블록 수, 블록당 데이터 바이트]
  const VERSIONS = [
    null,
    { size: 21, total: 26, data: 19, ec: 7, g1: [1, 19], g2: [0, 0], align: [] },
    { size: 25, total: 44, data: 34, ec: 10, g1: [1, 34], g2: [0, 0], align: [6, 18] },
    { size: 29, total: 70, data: 55, ec: 15, g1: [1, 55], g2: [0, 0], align: [6, 22] },
    { size: 33, total: 100, data: 80, ec: 20, g1: [1, 80], g2: [0, 0], align: [6, 26] },
    { size: 37, total: 134, data: 108, ec: 26, g1: [1, 108], g2: [0, 0], align: [6, 30] },
    { size: 41, total: 172, data: 136, ec: 18, g1: [2, 68], g2: [0, 0], align: [6, 34] },
    { size: 45, total: 196, data: 156, ec: 20, g1: [2, 78], g2: [0, 0], align: [6, 22, 38] },
    { size: 49, total: 242, data: 194, ec: 24, g1: [2, 97], g2: [0, 0], align: [6, 24, 42] },
    { size: 53, total: 292, data: 232, ec: 30, g1: [2, 116], g2: [0, 0], align: [6, 26, 46] },
    { size: 57, total: 346, data: 274, ec: 18, g1: [2, 68], g2: [2, 69], align: [6, 28, 50] },
    { size: 61, total: 404, data: 324, ec: 20, g1: [4, 81], g2: [0, 0], align: [6, 30, 54] },
    { size: 65, total: 466, data: 370, ec: 24, g1: [2, 92], g2: [2, 93], align: [6, 32, 58] },
    { size: 69, total: 532, data: 428, ec: 26, g1: [4, 107], g2: [0, 0], align: [6, 34, 62] },
    { size: 73, total: 581, data: 461, ec: 30, g1: [3, 115], g2: [1, 116], align: [6, 26, 46, 66] },
    { size: 77, total: 655, data: 523, ec: 22, g1: [5, 87], g2: [1, 88], align: [6, 26, 48, 70] }
  ];

  // BCH(15,5) 포맷 정보 계산 (EC Level L = 01)
  function getFormatBits(mask) {
    const data = (0b01 << 3) | (mask & 7);
    let rem = data << 10;
    for (let i = 4; i >= 0; i--) {
      if (rem & (1 << (i + 10))) rem ^= 0x537 << i;
    }
    return ((data << 10) | rem) ^ 0x5412;
  }

  // BCH(18,6) 버전 정보 계산 (Version 7 이상 필수)
  function getVersionBits(ver) {
    let rem = ver << 12;
    for (let i = 5; i >= 0; i--) {
      if (rem & (1 << (i + 12))) rem ^= 0x1f25 << i;
    }
    return (ver << 12) | rem;
  }

  function maskBit(mask, r, c) {
    switch (mask) {
      case 0: return (r + c) % 2 === 0;
      case 1: return r % 2 === 0;
      case 2: return c % 3 === 0;
      case 3: return (r + c) % 3 === 0;
      case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
      case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
      case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
      default: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
    }
  }

  function encodeQrMatrix(text) {
    const bytes = new TextEncoder().encode(String(text || ''));
    let ver = 1;
    while (ver <= 15) {
      const overhead = ver >= 10 ? 3 : 2;
      if (bytes.length <= VERSIONS[ver].data - overhead) break;
      ver++;
    }
    if (ver > 15) throw new Error('주소가 너무 깁니다 (최대 520바이트).');

    const spec = VERSIONS[ver];
    const size = spec.size;
    const lenBits = ver >= 10 ? 16 : 8;

    // 1) 비트 스트림 생성 (Byte Mode 0100 + length + data + terminator + pad)
    const bits = [];
    const pushBits = (val, len) => {
      for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
    };
    pushBits(0b0100, 4);
    pushBits(bytes.length, lenBits);
    for (const b of bytes) pushBits(b, 8);
    pushBits(0, Math.min(4, spec.data * 8 - bits.length));
    while (bits.length % 8 !== 0) bits.push(0);

    const dataBytes = new Uint8Array(spec.data);
    for (let i = 0; i < bits.length / 8; i++) {
      let byte = 0;
      for (let b = 0; b < 8; b++) byte = (byte << 1) | bits[i * 8 + b];
      dataBytes[i] = byte;
    }
    const pads = [0xec, 0x11];
    for (let i = bits.length / 8, p = 0; i < spec.data; i++, p ^= 1) {
      dataBytes[i] = pads[p];
    }

    // 2) Reed-Solomon 에러 정정 코드 생성 및 Group1/Group2 인터리빙
    const dBlocks = [];
    const eBlocks = [];
    let offset = 0;
    const pushGroup = (count, len) => {
      for (let b = 0; b < count; b++) {
        const slice = dataBytes.slice(offset, offset + len);
        offset += len;
        dBlocks.push(slice);
        eBlocks.push(rsEncode(slice, spec.ec));
      }
    };
    pushGroup(spec.g1[0], spec.g1[1]);
    pushGroup(spec.g2[0], spec.g2[1]);

    const codewords = new Uint8Array(spec.total);
    let idx = 0;
    const maxDataLen = Math.max(spec.g1[1], spec.g2[1]);
    for (let i = 0; i < maxDataLen; i++) {
      for (let b = 0; b < dBlocks.length; b++) {
        if (i < dBlocks[b].length) codewords[idx++] = dBlocks[b][i];
      }
    }
    for (let i = 0; i < spec.ec; i++) {
      for (let b = 0; b < eBlocks.length; b++) {
        codewords[idx++] = eBlocks[b][i];
      }
    }

    // 3) 고정 기능 패턴 배치
    const mat = Array.from({ length: size }, () => new Int8Array(size));
    const fixed = Array.from({ length: size }, () => new Uint8Array(size));

    const setMod = (r, c, v) => {
      if (r < 0 || c < 0 || r >= size || c >= size) return;
      mat[r][c] = v ? 1 : 0;
      fixed[r][c] = 1;
    };

    const drawFinder = (r0, c0) => {
      for (let dr = -1; dr <= 7; dr++) {
        for (let dc = -1; dc <= 7; dc++) {
          const r = r0 + dr;
          const c = c0 + dc;
          if (r < 0 || c < 0 || r >= size || c >= size) continue;
          const on =
            dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6 &&
            (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
          setMod(r, c, on ? 1 : 0);
        }
      }
    };

    drawFinder(0, 0);
    drawFinder(0, size - 7);
    drawFinder(size - 7, 0);

    // Timing patterns
    for (let i = 8; i < size - 8; i++) {
      setMod(6, i, i % 2 === 0 ? 1 : 0);
      setMod(i, 6, i % 2 === 0 ? 1 : 0);
    }

    // Alignment patterns (V2~V15)
    for (const rPos of spec.align) {
      for (const cPos of spec.align) {
        if ((rPos <= 8 && cPos <= 8) || (rPos <= 8 && cPos >= size - 9) || (rPos >= size - 9 && cPos <= 8)) {
          continue;
        }
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const on = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
            setMod(rPos + dr, cPos + dc, on ? 1 : 0);
          }
        }
      }
    }

    // Format info 영역 예약 및 Dark Module
    for (let i = 0; i < 9; i++) {
      if (i !== 6) { fixed[8][i] = 1; fixed[i][8] = 1; }
    }
    for (let i = size - 8; i < size; i++) {
      fixed[8][i] = 1;
      fixed[i][8] = 1;
    }
    setMod(size - 8, 8, 1);

    // Version info 패턴 기록 (Version 7~15 필수)
    if (ver >= 7) {
      const vBits = getVersionBits(ver);
      for (let i = 0; i < 18; i++) {
        const bit = (vBits >> i) & 1;
        const a = Math.floor(i / 3);
        const b = size - 11 + (i % 3);
        setMod(a, b, bit);
        setMod(b, a, bit);
      }
    }

    // 4) 데이터 비트 지그재그 배치 (마스크 0 적용)
    const mask = 0;
    let bitIdx = 0;
    const totalBits = codewords.length * 8;
    let upward = true;
    for (let col = size - 1; col >= 1; col -= 2) {
      if (col === 6) col--;
      for (let step = 0; step < size; step++) {
        const r = upward ? size - 1 - step : step;
        for (let d = 0; d < 2; d++) {
          const c = col - d;
          if (fixed[r][c]) continue;
          let bit = 0;
          if (bitIdx < totalBits) {
            bit = (codewords[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1;
            bitIdx++;
          }
          if (maskBit(mask, r, c)) bit ^= 1;
          mat[r][c] = bit;
        }
      }
      upward = !upward;
    }

    // 5) 포맷 정보 기록
    const fmt = getFormatBits(mask);
    const bitAt = (i) => (fmt >> i) & 1;
    const coords1 = [
      [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
      [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]
    ];
    for (let i = 0; i < 15; i++) {
      const [r, c] = coords1[i];
      mat[r][c] = bitAt(14 - i);
    }
    for (let i = 0; i < 7; i++) mat[size - 1 - i][8] = bitAt(14 - i);
    for (let i = 0; i < 8; i++) mat[8][size - 8 + i] = bitAt(7 - i);

    return mat;
  }

  function renderQrSvg(text, pxSize = 200) {
    const mat = encodeQrMatrix(text);
    const n = mat.length;
    const quiet = 3;
    const total = n + quiet * 2;
    let rects = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (mat[r][c]) {
          rects += `<rect x="${c + quiet}" y="${r + quiet}" width="1" height="1"/>`;
        }
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${pxSize}" height="${pxSize}" shape-rendering="crispEdges" role="img" aria-label="QR 코드"><rect width="${total}" height="${total}" fill="#ffffff" rx="2"/><g fill="#111827">${rects}</g></svg>`;
  }

  window.QRCodeSvg = { encodeQrMatrix, renderQrSvg };
})();
