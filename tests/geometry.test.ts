import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMat, displayedToForm, fitArtwork, invert, mul, placementTransform } from '../src/lib/geometry';
import { PT_PER_MM } from '../src/lib/units';
import { cuttingMarkLines } from '../src/lib/marks';

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);

test('matrix inverse', () => {
  const m = mul([2, 0, 0, 3, 5, 7], [0, 1, -1, 0, 4, 2]);
  const [x, y] = applyMat(mul(m, invert(m)), 11, -3);
  close(x, 11);
  close(y, -3);
});

test('displayed -> form mapping for each page rotation (corner checks)', () => {
  const W = 300, H = 200; // unrotated
  // [rotation, displayed point, expected form point]
  const cases: [number, [number, number], [number, number]][] = [
    [0, [0, 0], [0, H]], // displayed top-left = unrotated top-left
    [90, [0, 0], [0, 0]], // clockwise 90: displayed top-left = unrotated bottom-left
    [180, [0, 0], [W, 0]],
    [270, [0, 0], [W, H]],
    [90, [H, 0], [0, H]],
    [270, [0, W], [0, H]],
  ];
  for (const [rot, [dx, dy], [ex, ey]] of cases) {
    const [fx, fy] = applyMat(displayedToForm(rot, W, H), dx, dy);
    close(fx, ex);
    close(fy, ey);
  }
});

test('artwork fit never distorts', () => {
  for (const mode of ['contain', 'cover'] as const) {
    const f = fitArtwork(100, 50, 114.3, 114.3, mode);
    close(f.drawW / f.drawH, 2);
  }
  const c = fitArtwork(100, 50, 114.3, 114.3, 'contain');
  close(c.drawW, 114.3);
  close(c.offsetY, (114.3 - 57.15) / 2);
  const v = fitArtwork(100, 50, 114.3, 114.3, 'cover');
  close(v.drawH, 114.3);
  assert.ok(v.offsetX < 0);
});

test('crop corners land exactly on the card cell for every rotation / card rotation', () => {
  const sheetH = 297;
  for (const rotation of [0, 90, 180, 270]) {
    for (const rotated of [false, true]) {
      const boxW = 400, boxH = 300;
      const sw = rotation % 180 ? boxH : boxW;
      const sh = rotation % 180 ? boxW : boxH;
      const crop = { x: 0.1, y: 0.2, w: 0.5, h: 0.4 };
      const srcW = (crop.w * sw) / PT_PER_MM;
      const srcH = (crop.h * sh) / PT_PER_MM;
      const fit = fitArtwork(srcW, srcH, srcW, srcH, 'contain');
      const t = placementTransform({
        pageWpt: sw, pageHpt: sh, rotation, boxW, boxH, crop, fit,
        cellW: srcW, cellH: srcH, x: 20, y: 30, rotated, sheetH,
      });
      const pw = rotated ? srcH : srcW;
      const ph = rotated ? srcW : srcH;
      const [cl, cb, cw, ch] = t.cellRect;
      close(cl, 20 * PT_PER_MM);
      close(cb, (sheetH - 30 - ph) * PT_PER_MM);
      close(cw, pw * PT_PER_MM);
      close(ch, ph * PT_PER_MM);
      // art rect == cell rect (scale 1, contain, same aspect)
      for (let i = 0; i < 4; i++) close(t.artRect[i], t.cellRect[i], 1e-4);
      // the form-space corners of the crop map onto the cell corners
      const toForm = displayedToForm(rotation, boxW, boxH);
      const [fx, fy] = applyMat(toForm, crop.x * sw, crop.y * sh); // displayed TL of the crop
      const [sx, sy] = applyMat(t.matrix, fx, fy);
      // displayed TL of the crop maps to the nominal TL corner: sheet TL when upright, sheet BL when rotated 90° CCW
      const expectX = 20 * PT_PER_MM;
      const expectY = rotated ? (sheetH - 30 - ph) * PT_PER_MM : (sheetH - 30) * PT_PER_MM;
      close(sx, expectX, 1e-4);
      close(sy, expectY, 1e-4);
    }
  }
});

test('cutting marks stay outside card artwork and are skipped for tiny gaps', () => {
  const placements = [
    { sheet: 0, itemId: 'a', copy: 0, x: 10, y: 10, w: 50, h: 50, rotated: false },
    { sheet: 0, itemId: 'a', copy: 1, x: 63, y: 10, w: 50, h: 50, rotated: false },
  ];
  const { lines } = cuttingMarkLines(placements, 200, 200, 3, 3);
  assert.ok(lines.length > 0);
  for (const l of lines) {
    for (const p of placements) {
      // sample points along the line must not be strictly inside any card
      for (let i = 0; i <= 10; i++) {
        const x = l.x1 + ((l.x2 - l.x1) * i) / 10;
        const y = l.y1 + ((l.y2 - l.y1) * i) / 10;
        assert.ok(!(x > p.x + 1e-6 && x < p.x + p.w - 1e-6 && y > p.y + 1e-6 && y < p.y + p.h - 1e-6));
      }
    }
  }
  assert.equal(cuttingMarkLines(placements, 200, 200, 0.5, 3).lines.length, 0);
});
