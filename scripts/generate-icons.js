/**
 * Generate PNG icons from SVG for electron-builder.
 *
 * Usage:  node scripts/generate-icons.js
 *
 * Requirements (one-time):
 *   npm install --save-dev sharp
 *
 * On macOS you can also run:
 *   npx electron-icon-builder --input=resources/icon.png --output=resources
 * to produce .icns / .ico automatically.
 */

const fs = require('fs');
const path = require('path');

async function main() {
  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    console.error(
      'sharp is not installed. Run:\n  npm install --save-dev sharp\nThen rerun this script.'
    );
    process.exit(1);
  }

  const svgPath = path.join(__dirname, '..', 'resources', 'icon.svg');
  const outDir = path.join(__dirname, '..', 'resources');

  const svgBuf = fs.readFileSync(svgPath);

  // electron-builder needs at least 512x512 PNG for macOS .icns generation
  const sizes = [16, 32, 64, 128, 256, 512, 1024];

  for (const size of sizes) {
    const outFile = path.join(outDir, `icon_${size}x${size}.png`);
    await sharp(svgBuf).resize(size, size).png().toFile(outFile);
    console.log(`Created ${outFile}`);
  }

  // Main icon.png (512x512) used by electron-builder
  const mainIcon = path.join(outDir, 'icon.png');
  await sharp(svgBuf).resize(512, 512).png().toFile(mainIcon);
  console.log(`Created ${mainIcon}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
