// unwhite.js
// 讀取白底（近白，帶紙紋）JPG，依四角背景色去背，輸出透明 PNG。
//
// 算法：
//  1. 取四個角落各 40x40 像素，逐通道算中位數 -> bg 背景色
//  2. 每像素 d = max(|r-bg.r|, |g-bg.g|, |b-bg.b|)
//  3. alpha = smoothstep(d, LOW=12, HIGH=70)：d<=12 全透明，d>=70 全不透明，中間平滑內插
//  4. 反預乘：c' = clamp( (c - (1-alpha)*bg) / alpha )，alpha=0 時 c'=0
//  5. 輸出同名 .png 到 assets 根目錄

const fs = require('fs');
const path = require('path');
const jpeg = require('jpeg-js');
const { PNG } = require('pngjs');

const ASSETS_DIR = path.resolve(__dirname, '..');

const FILES = [
  'corner-large.jpg',
  'corner-small.jpg',
  'garland-horizontal.jpg',
  'garland-vertical.jpg',
  'wreath-half.jpg',
  'wreath-corner-pinecone.jpg',
];

const LOW = 12;
const HIGH = 70;
const CORNER_SIZE = 40;

function smoothstep(x, edge0, edge1) {
  if (x <= edge0) return 0;
  if (x >= edge1) return 1;
  const t = (x - edge0) / (edge1 - edge0);
  return t * t * (3 - 2 * t);
}

function median(arr) {
  const sorted = arr.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function getCornerMedian(data, width, height, cornerX, cornerY, size) {
  const rs = [], gs = [], bs = [];
  for (let y = cornerY; y < cornerY + size; y++) {
    for (let x = cornerX; x < cornerX + size; x++) {
      const idx = (y * width + x) * 4;
      rs.push(data[idx]);
      gs.push(data[idx + 1]);
      bs.push(data[idx + 2]);
    }
  }
  return { r: median(rs), g: median(gs), b: median(bs) };
}

function computeBackground(data, width, height) {
  const size = CORNER_SIZE;
  const corners = [
    getCornerMedian(data, width, height, 0, 0, size), // top-left
    getCornerMedian(data, width, height, width - size, 0, size), // top-right
    getCornerMedian(data, width, height, 0, height - size, size), // bottom-left
    getCornerMedian(data, width, height, width - size, height - size, size), // bottom-right
  ];
  // 對四角中位數再取中位數，避免其中一角剛好被花簇佔滿時被拉偏
  const r = median(corners.map((c) => c.r));
  const g = median(corners.map((c) => c.g));
  const b = median(corners.map((c) => c.b));
  return { r, g, b, corners };
}

function clamp255(v) {
  if (v < 0) return 0;
  if (v > 255) return 255;
  return Math.round(v);
}

function processFile(filename) {
  const jpgPath = path.join(ASSETS_DIR, filename);
  const pngName = filename.replace(/\.jpe?g$/i, '.png');
  const pngPath = path.join(ASSETS_DIR, pngName);

  const raw = fs.readFileSync(jpgPath);
  const decoded = jpeg.decode(raw, { useTArray: true, formatAsRGBA: true });
  const { width, height, data } = decoded; // data is RGBA Uint8Array

  const bg = computeBackground(data, width, height);

  const out = Buffer.alloc(width * height * 4);
  let transparentCount = 0;
  let opaqueCount = 0;

  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];

    const dr = Math.abs(r - bg.r);
    const dg = Math.abs(g - bg.g);
    const db = Math.abs(b - bg.b);
    const d = Math.max(dr, dg, db);

    const alpha = smoothstep(d, LOW, HIGH); // 0..1

    let outR, outG, outB;
    if (alpha === 0) {
      outR = 0;
      outG = 0;
      outB = 0;
      transparentCount++;
    } else {
      // 反預乘：假設原始合成 c = alpha*c' + (1-alpha)*bg  =>  c' = (c - (1-alpha)*bg) / alpha
      outR = clamp255((r - (1 - alpha) * bg.r) / alpha);
      outG = clamp255((g - (1 - alpha) * bg.g) / alpha);
      outB = clamp255((b - (1 - alpha) * bg.b) / alpha);
      if (alpha >= 0.999) opaqueCount++;
    }

    out[idx] = outR;
    out[idx + 1] = outG;
    out[idx + 2] = outB;
    out[idx + 3] = clamp255(alpha * 255);
  }

  const png = new PNG({ width, height });
  out.copy(png.data);
  const buf = PNG.sync.write(png);
  fs.writeFileSync(pngPath, buf);

  return {
    filename,
    pngName,
    width,
    height,
    bg,
    transparentRatio: transparentCount / (width * height),
    opaqueRatio: opaqueCount / (width * height),
  };
}

function verifyFile(filename, pngName, width, height) {
  const pngPath = path.join(ASSETS_DIR, pngName);
  const buf = fs.readFileSync(pngPath);
  const png = PNG.sync.read(buf);
  const { data, width: w, height: h } = png;

  function alphaAt(x, y) {
    const idx = (y * w + x) * 4;
    return data[idx + 3];
  }

  // 四角各取中心點檢查 alpha 是否為 0（用角落中心，避開邊緣抗鋸齒）
  const cornerPts = [
    [5, 5],
    [w - 6, 5],
    [5, h - 6],
    [w - 6, h - 6],
  ];
  const cornerAlphas = cornerPts.map(([x, y]) => alphaAt(x, y));
  const cornersAllZero = cornerAlphas.every((a) => a === 0);

  // 中心區域是否存在 alpha=255 的像素
  let hasOpaqueCenter = false;
  const cx0 = Math.floor(w * 0.35);
  const cx1 = Math.floor(w * 0.65);
  const cy0 = Math.floor(h * 0.35);
  const cy1 = Math.floor(h * 0.65);
  // 若中心範圍太小則掃整張圖
  const scanX0 = cx1 > cx0 ? cx0 : 0;
  const scanX1 = cx1 > cx0 ? cx1 : w;
  const scanY0 = cy1 > cy0 ? cy0 : 0;
  const scanY1 = cy1 > cy0 ? cy1 : h;

  outer: for (let y = scanY0; y < scanY1; y += 2) {
    for (let x = scanX0; x < scanX1; x += 2) {
      if (alphaAt(x, y) === 255) {
        hasOpaqueCenter = true;
        break outer;
      }
    }
  }

  // 若中心區域沒有，退而掃整張圖找 alpha=255
  if (!hasOpaqueCenter) {
    outer2: for (let y = 0; y < h; y += 3) {
      for (let x = 0; x < w; x += 3) {
        if (alphaAt(x, y) === 255) {
          hasOpaqueCenter = true;
          break outer2;
        }
      }
    }
  }

  return { cornerAlphas, cornersAllZero, hasOpaqueCenter };
}

function main() {
  console.log('=== unwhite.js：白底去背 ===\n');
  const results = [];
  for (const filename of FILES) {
    const jpgPath = path.join(ASSETS_DIR, filename);
    if (!fs.existsSync(jpgPath)) {
      console.error(`[跳過] 找不到檔案：${jpgPath}`);
      continue;
    }
    console.log(`處理中：${filename} ...`);
    const r = processFile(filename);
    const v = verifyFile(r.filename, r.pngName, r.width, r.height);
    results.push({ ...r, verify: v });

    console.log(
      `  尺寸: ${r.width}x${r.height}  bg=rgb(${r.bg.r.toFixed(1)},${r.bg.g.toFixed(1)},${r.bg.b.toFixed(1)})`
    );
    console.log(
      `  透明像素比例(alpha=0): ${(r.transparentRatio * 100).toFixed(1)}%   完全不透明比例(alpha=255): ${(r.opaqueRatio * 100).toFixed(1)}%`
    );
    console.log(
      `  驗證：四角 alpha=[${v.cornerAlphas.join(',')}] 全零=${v.cornersAllZero}  中心存在alpha=255像素=${v.hasOpaqueCenter}`
    );
    console.log(`  輸出：${r.pngName}\n`);
  }

  console.log('=== 總表 ===');
  for (const r of results) {
    console.log(
      `${r.filename} -> ${r.pngName} | bg=rgb(${r.bg.r.toFixed(0)},${r.bg.g.toFixed(0)},${r.bg.b.toFixed(0)}) | 透明比例=${(r.transparentRatio * 100).toFixed(1)}% | 四角全零=${r.verify.cornersAllZero} | 中心有不透明=${r.verify.hasOpaqueCenter}`
    );
  }
}

main();
