// Minimal typography rendered into a canvas texture (composited in FinalShader).
// Letters reveal with staggered rise, tracking and defocus-to-sharp; values are
// driven by the GSAP timeline so the result is deterministic.
import * as THREE from 'three';

const TITLE = 'TEMPVS';
const TAG = 'A ARTE DA PRECISÃO';

export function createTypography(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.premultiplyAlpha = true;
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  // Bundled OFL fonts first; if they can't load (e.g. a host that blocks local
  // font files) fall back to the same families from Google Fonts, if linked.
  const ready = (async () => {
    const faces = [
      new FontFace('Cormorant Garamond', 'url(assets/fonts/CormorantGaramond.ttf)', { weight: '300 700' }),
      new FontFace('Jost', 'url(assets/fonts/Jost.ttf)', { weight: '100 900' }),
    ];
    for (const f of faces) {
      try { document.fonts.add(await f.load()); } catch (e) { console.warn('font fallback:', f.family); }
    }
    await Promise.all([document.fonts.load('300 64px "Cormorant Garamond"'), document.fonts.load('300 24px Jost')]).catch(() => {});
  })();

  const s = h / 1920; // layout authored at 1080x1920
  const ease = (x) => 1 - Math.pow(1 - Math.min(Math.max(x, 0), 1), 3);
  let last = '';

  function draw(title, line, tag) {
    const key = `${title.toFixed(4)}|${line.toFixed(4)}|${tag.toFixed(4)}`;
    if (key === last) return;
    last = key;
    ctx.clearRect(0, 0, w, h);
    if (title <= 0 && line <= 0 && tag <= 0) { texture.needsUpdate = true; return; }

    const cx = w / 2;
    // ---- title: per-letter reveal
    const ty = 1505 * s;
    const size = 132 * s;
    ctx.font = `300 ${size}px "Cormorant Garamond", Georgia, serif`;
    ctx.textBaseline = 'alphabetic';
    const track = (0.42 + 0.12 * (1 - ease(title))) * size;
    const widths = [...TITLE].map((c) => ctx.measureText(c).width);
    const total = widths.reduce((a, b) => a + b, 0) + track * (TITLE.length - 1);
    let x = cx - total / 2;
    [...TITLE].forEach((c, i) => {
      const p = ease((title * 1.6) - i * 0.11);
      if (p > 0) {
        ctx.save();
        ctx.globalAlpha = p;
        ctx.filter = p < 0.999 ? `blur(${((1 - p) * 10 * s).toFixed(2)}px)` : 'none';
        const g = ctx.createLinearGradient(0, ty - size * 0.75, 0, ty);
        g.addColorStop(0, '#fbf3e4');
        g.addColorStop(1, '#d9c3a0');
        ctx.fillStyle = g;
        ctx.shadowColor = 'rgba(255, 196, 120, 0.35)';
        ctx.shadowBlur = 22 * s;
        ctx.fillText(c, x, ty + (1 - p) * 26 * s);
        ctx.restore();
      }
      x += widths[i] + track;
    });

    // ---- hairline
    if (line > 0) {
      const lw = 300 * s * ease(line);
      const ly = 1562 * s;
      const g = ctx.createLinearGradient(cx - lw / 2, 0, cx + lw / 2, 0);
      g.addColorStop(0, 'rgba(214,176,120,0)');
      g.addColorStop(0.5, 'rgba(236,204,150,0.95)');
      g.addColorStop(1, 'rgba(214,176,120,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - lw / 2, ly, lw, Math.max(1, 1.6 * s));
      // small diamond at centre
      ctx.save();
      ctx.globalAlpha = ease(line * 1.5 - 0.4);
      ctx.translate(cx, ly + 0.8 * s);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#eccc96';
      const d = 5 * s;
      ctx.fillRect(-d / 2, -d / 2, d, d);
      ctx.restore();
    }

    // ---- tagline
    if (tag > 0) {
      const p = ease(tag);
      const tsz = 25 * s;
      ctx.save();
      ctx.font = `300 ${tsz}px Jost, "Helvetica Neue", Arial, sans-serif`;
      ctx.letterSpacing = `${((0.55 + 0.25 * (1 - p)) * tsz).toFixed(2)}px`;
      ctx.textAlign = 'center';
      ctx.globalAlpha = p * 0.85;
      ctx.fillStyle = '#e8dccb';
      ctx.filter = p < 0.999 ? `blur(${((1 - p) * 6 * s).toFixed(2)}px)` : 'none';
      // letterSpacing adds trailing space after the last glyph; compensate
      ctx.fillText(TAG, cx + ((0.55 + 0.25 * (1 - p)) * tsz) / 2, 1625 * s);
      ctx.restore();
    }
    texture.needsUpdate = true;
  }

  return { texture, draw, ready };
}
