/**
 * Generate all icon sizes from resources/neur-icon.png
 *
 * Usage:  node scripts/generate-icons.js
 *
 * Requirements (one-time install):
 *   npm install --save-dev sharp png-to-ico
 */

const fs   = require('fs');
const path = require('path');

const SOURCE = path.join(__dirname, '..', 'resources', 'neur-icon.png');
const OUT    = path.join(__dirname, '..', 'resources');

// Sizes needed by electron-builder (Windows .ico, macOS .icns, Linux)
const PNG_SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];

// Windows .ico contains these sizes embedded
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

async function main() {
  // ── dependency checks ──────────────────────────────────────────────────────
  let sharp, pngToIco;
  try { sharp = require('sharp'); }
  catch {
    console.error('sharp not found. Run:  npm install --save-dev sharp');
    process.exit(1);
  }
  try { pngToIco = require('png-to-ico').imagesToIco; }
  catch {
    console.error('png-to-ico not found. Run:  npm install --save-dev png-to-ico');
    process.exit(1);
  }

  if (!fs.existsSync(SOURCE)) {
    console.error(`Source not found: ${SOURCE}`);
    process.exit(1);
  }

  console.log(`Source: ${SOURCE}\n`);

  // ── generate PNGs ──────────────────────────────────────────────────────────
  const icoPngBuffers = [];

  for (const size of PNG_SIZES) {
    const outFile = path.join(OUT, `icon_${size}x${size}.png`);
    const buf = await sharp(SOURCE)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    fs.writeFileSync(outFile, buf);
    console.log(`  ✓  ${size}x${size}  →  ${path.basename(outFile)}`);

    if (ICO_SIZES.includes(size)) icoPngBuffers.push(buf);
  }

  // Copy 512x512 as the main icon.png used by electron-builder
  const buf512 = await sharp(SOURCE)
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(OUT, 'icon.png'), buf512);
  console.log(`  ✓  512x512  →  icon.png  (main)`);

  // ── generate .ico (Windows) ────────────────────────────────────────────────
  const icoPath = path.join(OUT, 'icon.ico');
  const icoBuf  = pngToIco(icoPngBuffers);
  fs.writeFileSync(icoPath, icoBuf);
  console.log(`  ✓  icon.ico  (${ICO_SIZES.join(', ')} px embedded)`);

  // ── generate tray icon (22x22, transparent) ────────────────────────────────
  const trayBuf = await sharp(SOURCE)
    .resize(22, 22, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(OUT, 'tray-icon.png'), trayBuf);
  console.log(`  ✓  22x22   →  tray-icon.png`);

  console.log('\nDone! All icons generated from neur-icon.png');
}

main().catch((err) => { console.error(err); process.exit(1); });
