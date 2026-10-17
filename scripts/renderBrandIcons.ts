/**
 * Rasterize public/favicon.svg (the header brand mark) into the PNG and ICO
 * icons. Run with `npx tsx scripts/renderBrandIcons.ts`. Requires Chrome.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const publicDir = path.join(root, 'public');
const svg = fs.readFileSync(path.join(publicDir, 'favicon.svg'), 'utf8');

const sizes = [
  { file: 'favicon-32.png', size: 32 },
  { file: 'apple-touch-icon.png', size: 180 },
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
] as const;

function page(size: number): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  html, body { margin: 0; width: ${size}px; height: ${size}px; overflow: hidden; background: #0b0d11; }
  svg { display: block; width: ${size}px; height: ${size}px; }
</style>
</head>
<body>
${svg}
</body>
</html>`;
}

function renderPng(size: number, outFile: string, port: number): Promise<void> {
  const htmlPath = path.join(publicDir, `.icon-${size}.html`);
  fs.writeFileSync(htmlPath, page(size));
  const profile = path.join('/tmp', `lumiphane-icon-chrome-${size}`);
  fs.rmSync(profile, { recursive: true, force: true });

  return new Promise((resolve, reject) => {
    const child = spawn(
      'google-chrome',
      [
        '--headless=new',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--hide-scrollbars',
        '--force-device-scale-factor=1',
        `--window-size=${size},${size}`,
        `--user-data-dir=${profile}`,
        `--remote-debugging-port=${port}`,
        `--screenshot=${outFile}`,
        `file://${htmlPath}`,
      ],
      { stdio: 'ignore' }
    );

    const started = Date.now();
    const timer = setInterval(() => {
      if (fs.existsSync(outFile) && fs.statSync(outFile).size > 0) {
        clearInterval(timer);
        clearTimeout(giveUp);
        child.kill('SIGKILL');
        fs.rmSync(htmlPath, { force: true });
        resolve();
        return;
      }
      if (Date.now() - started > 20000) {
        clearInterval(timer);
      }
    }, 100);

    const giveUp = setTimeout(() => {
      clearInterval(timer);
      child.kill('SIGKILL');
      fs.rmSync(htmlPath, { force: true });
      reject(new Error(`Chrome did not write ${outFile}`));
    }, 20000);

    child.on('error', (err) => {
      clearInterval(timer);
      clearTimeout(giveUp);
      reject(err);
    });
  });
}

function pngSize(file: string): { width: number; height: number } {
  const data = fs.readFileSync(file);
  if (data.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error(`${file} is not a PNG`);
  }
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

function writeIco(pngFile: string, icoFile: string): void {
  const png = fs.readFileSync(pngFile);
  const { width, height } = pngSize(pngFile);
  if (width > 255 || height > 255) {
    throw new Error('ICO entries store width and height in one byte');
  }
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry.writeUInt8(width, 0);
  entry.writeUInt8(height, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(22, 12);
  fs.writeFileSync(icoFile, Buffer.concat([header, entry, png]));
}

const scratch32 = path.join(publicDir, 'favicon-32.png');
await Promise.all(
  sizes.map((item, index) =>
    renderPng(item.size, path.join(publicDir, item.file), 9300 + index)
  )
);

for (const item of sizes) {
  const file = path.join(publicDir, item.file);
  const { width, height } = pngSize(file);
  if (width !== item.size || height !== item.size) {
    throw new Error(`${item.file} is ${width}x${height}, expected ${item.size}x${item.size}`);
  }
  console.log(`${item.file} ${width}x${height}`);
}

writeIco(scratch32, path.join(publicDir, 'favicon.ico'));
fs.rmSync(scratch32, { force: true });
console.log('favicon.ico 32x32');
