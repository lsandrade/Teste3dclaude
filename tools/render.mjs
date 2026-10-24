// Deterministic offline renderer.
//   node tools/render.mjs stills [t1 t2 ...]   -> renders/stills/frame_<t>s.png
//   node tools/render.mjs video [--fps 30] [--from 0] [--to 12]
//                                              -> renders/tempvs_1080x1920.mp4
// Every frame is rendered by calling window.renderAt(t) with t = frame / fps,
// so the output does not depend on wall-clock speed.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'renders');
const args = process.argv.slice(2);
const mode = args[0] || 'stills';
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.ttf': 'font/ttf', '.json': 'application/json', '.png': 'image/png' };
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

async function main() {
  const srv = await serve();
  const port = srv.address().port;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.type(), m.text()); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${port}/index.html?capture${opt('query', '')}`);
  await page.waitForFunction(() => window.ready !== undefined, null, { timeout: 120000 });
  await page.evaluate(() => window.ready);

  const grab = async (t) => {
    const url = await page.evaluate((tt) => {
      window.renderAt(tt);
      return document.getElementById('stage').toDataURL('image/png');
    }, t);
    return Buffer.from(url.split(',')[1], 'base64');
  };

  if (mode === 'stills') {
    const times = args.slice(1).filter((a, i, all) => !a.startsWith('--') && !(all[i - 1] || '').startsWith('--')).map(Number);
    const list = times.length ? times : [1, 4, 7, 11];
    const dir = path.join(OUT, opt('dir', 'stills'));
    fs.mkdirSync(dir, { recursive: true });
    for (const t of list) {
      const t0 = Date.now();
      const png = await grab(t);
      const f = path.join(dir, `frame_${String(t).padStart(5, '0')}s.png`);
      fs.writeFileSync(f, png);
      console.log(`t=${t}s -> ${path.relative(ROOT, f)} (${Date.now() - t0} ms)`);
    }
  } else if (mode === 'video') {
    const fps = Number(opt('fps', 30));
    const from = Number(opt('from', 0));
    const to = Number(opt('to', 12));
    const out = path.join(OUT, opt('out', 'tempvs_1080x1920.mp4'));
    fs.mkdirSync(OUT, { recursive: true });
    const ff = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart',
      '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', out], { stdio: ['pipe', 'inherit', 'inherit'] });
    const frames = Math.round((to - from) * fps);
    const start = Date.now();
    for (let i = 0; i < frames; i++) {
      const t = from + i / fps;
      const png = await grab(t);
      if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
      if (i % 15 === 0) {
        const el = (Date.now() - start) / 1000;
        console.log(`frame ${i + 1}/${frames}  t=${t.toFixed(3)}s  elapsed ${el.toFixed(0)}s  eta ${((el / (i + 1)) * (frames - i - 1)).toFixed(0)}s`);
      }
    }
    ff.stdin.end();
    await new Promise((r) => ff.on('close', r));
    console.log('wrote', path.relative(ROOT, out));
  }
  await browser.close();
  srv.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
