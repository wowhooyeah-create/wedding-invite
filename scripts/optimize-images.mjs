// scripts/optimize-images.mjs
// 把 scripts/raw/ 底下的婚禮素材原檔（去背 PNG）壓成 WebP（帶 alpha）＋ PNG fallback，
// 輸出到 public/art/，給前端 <picture> 用。
//
// 用法：nvm use 20; npm run images

import { readFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.join(__dirname, 'raw');
const OUT_DIR = path.join(__dirname, '..', 'public', 'art');

// 每個素材的輸出設定：resizeTo 是長邊像素，outName 是輸出檔名（不含副檔名）
// quality／alphaQuality 個別調整：帶大面積去背透明邊緣（松針、莓果）的插畫，
// 光是把 quality 壓低效果有限——真正吃掉檔案體積的是 alpha 通道的細碎邊緣，
// 所以這幾張額外把 alphaQuality 一起降低，才能把 WebP 壓到 250KB 以內。
// wreath-half 原規格是長邊 1400，但在 1400 的尺寸下即使 alphaQuality 壓到 35
// 仍卡在 270KB 上下（見驗收自檢），為了守住「每張 < 250KB」的硬性驗收標準，
// 改成長邊 1150（肉眼可接受、hero 區用 clamp() 縮放不受影響），實際輸出約 227KB。
// pngResizeTo／pngQuality：PNG fallback 只給極少數不支援 WebP 的舊瀏覽器看，
// 不需要跟 WebP 同樣尺寸，所以插畫類的幾張額外縮小＋降質，確保 fallback 也 < 250KB。
const JOBS = [
  {
    input: 'wreath-half.png',
    outName: 'wreath-half',
    resizeTo: 1150,
    quality: 74,
    alphaQuality: 55,
    pngResizeTo: 950,
    pngQuality: 60,
  },
  { input: 'corner-large.png', outName: 'corner-large', resizeTo: 1000, quality: 78, alphaQuality: 65 },
  {
    input: 'corner-small.png',
    outName: 'corner-small',
    resizeTo: 1000,
    quality: 76,
    alphaQuality: 55,
    pngResizeTo: 850,
    pngQuality: 60,
  },
  { input: 'garland-horizontal.png', outName: 'garland-horizontal', resizeTo: 1600, quality: 76, alphaQuality: 55 },
  { input: 'garland-vertical.png', outName: 'garland-vertical', resizeTo: 1600, quality: 78, alphaQuality: 65 },
  { input: 'wreath-corner-pinecone.png', outName: 'wreath-corner-pinecone', resizeTo: 800, quality: 82, alphaQuality: 100 },
  { input: 'couple.png', outName: 'couple', resizeTo: 1200, quality: 82, alphaQuality: 100, pngQuality: 70 },
];

function formatKB(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

async function run() {
  if (!existsSync(RAW_DIR)) {
    console.error(`[optimize-images] 找不到原始素材資料夾：${RAW_DIR}`);
    process.exit(1);
  }
  await mkdir(OUT_DIR, { recursive: true });

  console.log('[optimize-images] 開始壓縮圖片...\n');

  const results = [];

  for (const job of JOBS) {
    const inputPath = path.join(RAW_DIR, job.input);
    if (!existsSync(inputPath)) {
      console.warn(`[optimize-images] 略過（找不到檔案）：${job.input}`);
      continue;
    }

    const buffer = await readFile(inputPath); // rotate() 在下面兩個 pipeline 各自呼叫，處理 EXIF 方向

    const metadata = await sharp(buffer).metadata();
    const isLandscape = (metadata.width ?? 0) >= (metadata.height ?? 0);

    // 依長邊等比縮放：橫圖限制寬度，直圖限制高度
    const resizeOptions = isLandscape
      ? { width: job.resizeTo, withoutEnlargement: true }
      : { height: job.resizeTo, withoutEnlargement: true };

    // WebP（主要格式，帶 alpha 透明背景）
    const webpPath = path.join(OUT_DIR, `${job.outName}.webp`);
    await sharp(buffer)
      .rotate()
      .resize(resizeOptions)
      .webp({ quality: job.quality, alphaQuality: job.alphaQuality, effort: 6 })
      .toFile(webpPath);

    // PNG fallback（給不支援 WebP 的舊瀏覽器，如老版 LINE 內建瀏覽器）
    // palette + quality 用 libimagequant 量化調色盤，體積會比純 compressionLevel 小很多；
    // 部分素材另外用 pngResizeTo／pngQuality 縮得更小，確保 fallback 也守住 250KB
    const pngResizeTo = job.pngResizeTo ?? job.resizeTo;
    const pngResizeOptions = isLandscape
      ? { width: pngResizeTo, withoutEnlargement: true }
      : { height: pngResizeTo, withoutEnlargement: true };
    const pngPath = path.join(OUT_DIR, `${job.outName}.png`);
    await sharp(buffer)
      .rotate()
      .resize(pngResizeOptions)
      .png({ compressionLevel: 9, palette: true, quality: job.pngQuality ?? 80, effort: 8 })
      .toFile(pngPath);

    const webpSize = (await stat(webpPath)).size;
    const pngSize = (await stat(pngPath)).size;

    results.push({ name: job.outName, webpSize, pngSize });
    console.log(
      `  ${job.outName.padEnd(24)} webp ${formatKB(webpSize).padStart(9)}  |  png ${formatKB(pngSize).padStart(9)}`
    );
  }

  console.log('\n[optimize-images] 完成。');

  const overLimit = results.filter((r) => r.webpSize >= 250 * 1024 || r.pngSize >= 250 * 1024);
  if (overLimit.length > 0) {
    console.warn('\n[optimize-images] 警告：以下檔案超過 250 KB，請檢查：');
    for (const r of overLimit) {
      console.warn(`  - ${r.name}: webp ${formatKB(r.webpSize)} / png ${formatKB(r.pngSize)}`);
    }
  }
}

run().catch((err) => {
  console.error('[optimize-images] 發生錯誤：', err);
  process.exit(1);
});
