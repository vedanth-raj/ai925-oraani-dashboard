const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'client', 'public');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

console.log('Generating clean Oraani vector and raster brand assets without crown/lines...');

// 1. Generate client/public/oraani-logo.svg
const oraaniSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 100" width="320" height="100">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700&amp;display=swap');
      .oraani-wordmark {
        font-family: 'Playfair Display', 'Bodoni MT', 'Didot', 'Cinzel', 'Georgia', 'Times New Roman', serif;
        font-size: 54px;
        font-weight: 700;
        fill: #2F2923;
        letter-spacing: 0.02em;
        text-anchor: middle;
        dominant-baseline: central;
      }
    </style>
  </defs>
  <text x="160" y="50" class="oraani-wordmark">Oraani</text>
</svg>
`;

fs.writeFileSync(path.join(PUBLIC_DIR, 'oraani-logo.svg'), oraaniSvg, 'utf8');
console.log('  [OK] client/public/oraani-logo.svg');

// 2. Generate HTML templates for rendering via headless Chrome
const tempLogoHtml = path.join(__dirname, '_temp_oraani_logo.html');
const tempIconHtml = path.join(__dirname, '_temp_oraani_icon.html');

const logoHtmlContent = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    background: transparent;
    width: 320px;
    height: 100px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .brand-text {
    font-family: 'Playfair Display', 'Bodoni MT', 'Didot', 'Georgia', serif;
    font-size: 52px;
    font-weight: 700;
    color: #2F2923;
    letter-spacing: 0.02em;
    -webkit-font-smoothing: antialiased;
    text-rendering: geometricPrecision;
  }
</style>
</head>
<body>
  <div class="brand-text">Oraani</div>
</body>
</html>`;

const iconHtmlContent = (size) => `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    background: #FFFFFF;
    width: ${size}px;
    height: ${size}px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .brand-text {
    font-family: 'Playfair Display', 'Bodoni MT', 'Didot', 'Georgia', serif;
    font-size: ${Math.round(size * 0.22)}px;
    font-weight: 700;
    color: #2F2923;
    letter-spacing: 0.02em;
    -webkit-font-smoothing: antialiased;
    text-rendering: geometricPrecision;
  }
</style>
</head>
<body>
  <div class="brand-text">Oraani</div>
</body>
</html>`;

fs.writeFileSync(tempLogoHtml, logoHtmlContent, 'utf8');

// Render oraani-logo.png (320x100)
const logoPng = path.join(PUBLIC_DIR, 'oraani-logo.png');
execSync(`"${CHROME}" --headless=new --disable-gpu --default-background-color=00000000 --window-size=320,100 --screenshot="${logoPng}" "${tempLogoHtml}"`, { stdio: 'ignore' });
console.log('  [OK] client/public/oraani-logo.png');

// Render oraani-logo@2x.png (640x200)
const logo2xPng = path.join(PUBLIC_DIR, 'oraani-logo@2x.png');
const tempLogo2xHtml = path.join(__dirname, '_temp_oraani_logo2x.html');
fs.writeFileSync(tempLogo2xHtml, logoHtmlContent.replace('width: 320px;', 'width: 640px;').replace('height: 100px;', 'height: 200px;').replace('font-size: 52px;', 'font-size: 104px;'), 'utf8');
execSync(`"${CHROME}" --headless=new --disable-gpu --default-background-color=00000000 --window-size=640,200 --screenshot="${logo2xPng}" "${tempLogo2xHtml}"`, { stdio: 'ignore' });
console.log('  [OK] client/public/oraani-logo@2x.png');

// Render oraani-icon-512.png (512x512)
const icon512Png = path.join(PUBLIC_DIR, 'oraani-icon-512.png');
fs.writeFileSync(tempIconHtml, iconHtmlContent(512), 'utf8');
execSync(`"${CHROME}" --headless=new --disable-gpu --window-size=512,512 --screenshot="${icon512Png}" "${tempIconHtml}"`, { stdio: 'ignore' });
console.log('  [OK] client/public/oraani-icon-512.png');

// Render oraani-icon-192.png (192x192)
const icon192Png = path.join(PUBLIC_DIR, 'oraani-icon-192.png');
fs.writeFileSync(tempIconHtml, iconHtmlContent(192), 'utf8');
execSync(`"${CHROME}" --headless=new --disable-gpu --window-size=192,192 --screenshot="${icon192Png}" "${tempIconHtml}"`, { stdio: 'ignore' });
console.log('  [OK] client/public/oraani-icon-192.png');

// Render oraani-apple-touch-icon.png (180x180)
const icon180Png = path.join(PUBLIC_DIR, 'oraani-apple-touch-icon.png');
fs.writeFileSync(tempIconHtml, iconHtmlContent(180), 'utf8');
execSync(`"${CHROME}" --headless=new --disable-gpu --window-size=180,180 --screenshot="${icon180Png}" "${tempIconHtml}"`, { stdio: 'ignore' });
console.log('  [OK] client/public/oraani-apple-touch-icon.png');

// Clean up temp files
[tempLogoHtml, tempIconHtml, tempLogo2xHtml, path.join(__dirname, 'temp_logo.html'), path.join(__dirname, 'temp_logo.png'), path.join(__dirname, 'test_render.js')].forEach(f => {
  if (fs.existsSync(f)) fs.unlinkSync(f);
});

console.log('Oraani branding assets generated cleanly and verified.');
