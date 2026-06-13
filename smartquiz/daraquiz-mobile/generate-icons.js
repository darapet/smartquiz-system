#!/usr/bin/env node
/**
 * DaraQuiz AI - Icon Generator
 * Generates all required Android and iOS icon sizes from logo-source.png
 * Run: node generate-icons.js
 * Requires: npm install sharp
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SOURCE = path.join(__dirname, 'logo-source.png');

const ANDROID_ICONS = [
  { dir: 'mipmap-mdpi',    size: 48  },
  { dir: 'mipmap-hdpi',    size: 72  },
  { dir: 'mipmap-xhdpi',   size: 96  },
  { dir: 'mipmap-xxhdpi',  size: 144 },
  { dir: 'mipmap-xxxhdpi', size: 192 },
];

const ANDROID_ROUND_ICONS = [
  { dir: 'mipmap-mdpi',    size: 48  },
  { dir: 'mipmap-hdpi',    size: 72  },
  { dir: 'mipmap-xhdpi',   size: 96  },
  { dir: 'mipmap-xxhdpi',  size: 144 },
  { dir: 'mipmap-xxxhdpi', size: 192 },
];

const ANDROID_SPLASH_SIZES = [
  { dir: 'drawable',      w: 480,  h: 320  },
  { dir: 'drawable-land-mdpi',  w: 480,  h: 320 },
  { dir: 'drawable-land-hdpi',  w: 800,  h: 480 },
  { dir: 'drawable-land-xhdpi', w: 1280, h: 720 },
  { dir: 'drawable-land-xxhdpi',w: 1600, h: 960 },
  { dir: 'drawable-port-mdpi',  w: 320,  h: 480 },
  { dir: 'drawable-port-hdpi',  w: 480,  h: 800 },
  { dir: 'drawable-port-xhdpi', w: 720,  h: 1280 },
  { dir: 'drawable-port-xxhdpi',w: 960,  h: 1600 },
];

const IOS_ICONS = [
  { name: 'Icon-20@1x.png',    size: 20  },
  { name: 'Icon-20@2x.png',    size: 40  },
  { name: 'Icon-20@3x.png',    size: 60  },
  { name: 'Icon-29@1x.png',    size: 29  },
  { name: 'Icon-29@2x.png',    size: 58  },
  { name: 'Icon-29@3x.png',    size: 87  },
  { name: 'Icon-40@1x.png',    size: 40  },
  { name: 'Icon-40@2x.png',    size: 80  },
  { name: 'Icon-40@3x.png',    size: 120 },
  { name: 'Icon-60@2x.png',    size: 120 },
  { name: 'Icon-60@3x.png',    size: 180 },
  { name: 'Icon-76@1x.png',    size: 76  },
  { name: 'Icon-76@2x.png',    size: 152 },
  { name: 'Icon-83.5@2x.png',  size: 167 },
  { name: 'Icon-1024@1x.png',  size: 1024},
];

async function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function generateAndroidIcons() {
  console.log('Generating Android icons...');
  for (const { dir, size } of ANDROID_ICONS) {
    const outDir = path.join(__dirname, 'resources', 'android', 'icon', dir);
    await ensureDir(outDir);
    await sharp(SOURCE)
      .resize(size, size, { fit: 'contain', background: { r: 13, g: 46, b: 125, alpha: 1 } })
      .toFile(path.join(outDir, 'ic_launcher.png'));
    await sharp(SOURCE)
      .resize(size, size, { fit: 'contain', background: { r: 13, g: 46, b: 125, alpha: 1 } })
      .toFile(path.join(outDir, 'ic_launcher_round.png'));
    // Foreground for adaptive icons
    await sharp(SOURCE)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toFile(path.join(outDir, 'ic_launcher_foreground.png'));
    console.log(`  ✓ ${dir} (${size}x${size})`);
  }
}

async function generateAndroidSplash() {
  console.log('Generating Android splash screens...');
  for (const { dir, w, h } of ANDROID_SPLASH_SIZES) {
    const outDir = path.join(__dirname, 'resources', 'android', 'splash', dir);
    await ensureDir(outDir);
    // Blue background with centered logo
    const logoSize = Math.floor(Math.min(w, h) * 0.5);
    const logoBuffer = await sharp(SOURCE)
      .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer();
    await sharp({
      create: { width: w, height: h, channels: 4, background: { r: 13, g: 46, b: 125, alpha: 1 } }
    })
      .composite([{ input: logoBuffer, gravity: 'center' }])
      .png()
      .toFile(path.join(outDir, 'splash.png'));
    console.log(`  ✓ ${dir} (${w}x${h})`);
  }
}

async function generateIosIcons() {
  console.log('Generating iOS icons...');
  const outDir = path.join(__dirname, 'resources', 'ios', 'icon');
  await ensureDir(outDir);
  for (const { name, size } of IOS_ICONS) {
    await sharp(SOURCE)
      .resize(size, size, { fit: 'contain', background: { r: 13, g: 46, b: 125, alpha: 1 } })
      .toFile(path.join(outDir, name));
    console.log(`  ✓ ${name} (${size}x${size})`);
  }
}

async function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error('ERROR: logo-source.png not found. Place it in the project root.');
    process.exit(1);
  }
  try {
    await generateAndroidIcons();
    await generateAndroidSplash();
    await generateIosIcons();
    console.log('\n✅ All icons generated in resources/');
    console.log('Next: run  npx cap sync  to apply them to native projects.');
  } catch (err) {
    console.error('Error generating icons:', err.message);
    process.exit(1);
  }
}

main();
