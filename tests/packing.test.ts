import test from 'node:test';
import assert from 'node:assert/strict';
import { gridCapacity, planPack, type PackItem, type PackSettings } from '../src/lib/packing';
import { validatePacking } from '../src/lib/validate';

const base: PackSettings = {
  sheetW: 420, sheetH: 297, marginTop: 10, marginRight: 10, marginBottom: 10, marginLeft: 10,
  gapX: 3, gapY: 3, allowRotate: true, arrangeMode: 'mixed',
};
const item = (id: string, w: number, h: number, qty: number): PackItem => ({ id, name: id, w, h, qty });

test('default 4.5in card on A3: 3 x 2 = 6 per sheet', () => {
  const g = gridCapacity(400, 277, 114.3, 114.3, 3, 3, true);
  assert.equal(g.best.cols, 3);
  assert.equal(g.best.rows, 2);
  assert.equal(g.best.capacity, 6);
});

test('spec example: 90 cards with capacity 24 -> 24, 24, 24, 18', () => {
  const r = planPack([item('a', 60, 60, 90)], base);
  assert.equal(r.capacityPerSheet, 24);
  assert.deepEqual(r.sheets.map((s) => s.placements.length), [24, 24, 24, 18]);
  assert.equal(r.placed, 90);
  assert.equal(r.errors.length, 0);
});

test('rotated orientation is chosen when it fits more cards', () => {
  const s = { ...base, sheetW: 297, sheetH: 210 };
  const g = gridCapacity(277, 190, 60, 100, 3, 3, true);
  assert.equal(g.normal.capacity, 4);
  assert.equal(g.rotated?.capacity, 6);
  assert.equal(g.best.rotated, true);
  const r = planPack([item('a', 60, 100, 6)], s);
  assert.equal(r.sheets.length, 1);
  assert.ok(r.sheets[0].placements.every((p) => p.rotated && p.w === 100 && p.h === 60));
});

test('rotation disabled keeps normal orientation', () => {
  const g = gridCapacity(277, 190, 60, 100, 3, 3, false);
  assert.equal(g.best.rotated, false);
  assert.equal(g.best.capacity, 4);
});

test('exact fit counts (floating point safe)', () => {
  // 2 cards of 100 + 1 gap of 3 = 203 exactly
  const g = gridCapacity(203, 100, 100, 100, 3, 3, false);
  assert.equal(g.best.capacity, 2);
  const g2 = gridCapacity(202.999, 100, 100, 100, 3, 3, false);
  assert.equal(g2.best.capacity, 1);
});

test('card larger than the sheet gives a clear error', () => {
  const r = planPack([item('big', 500, 500, 1)], base);
  assert.equal(r.sheets.length, 0);
  assert.match(r.errors[0], /does not fit/);
});

test('margins larger than the sheet give an error', () => {
  const r = planPack([item('a', 10, 10, 1)], { ...base, marginLeft: 300, marginRight: 300 });
  assert.match(r.errors[0], /margins/i);
});

test('group mode: each design starts on its own sheet', () => {
  const items = [item('a', 60, 60, 30), item('b', 60, 60, 3)];
  const g = planPack(items, { ...base, arrangeMode: 'group' });
  assert.deepEqual(g.sheets.map((s) => s.placements.length), [24, 6, 3]);
  assert.ok(g.sheets.every((s) => new Set(s.placements.map((p) => p.itemId)).size === 1));
  const m = planPack(items, { ...base, arrangeMode: 'mixed' });
  assert.deepEqual(m.sheets.map((s) => s.placements.length), [24, 9]);
  assert.equal(new Set(m.sheets[1].placements.map((p) => p.itemId)).size, 2);
});

test('mixed sizes use MaxRects and keep every quantity', () => {
  const items = [item('a', 114.3, 114.3, 7), item('b', 60, 90, 11), item('c', 40, 40, 25)];
  const r = planPack(items, base);
  assert.equal(r.algorithm, 'maxrects');
  assert.equal(r.placed, 43);
  const v = validatePacking({ sheets: r.sheets, items, settings: base });
  assert.deepEqual(v.issues, []);
});

test('property test: random jobs never overlap, never exceed margins, never lose cards', () => {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  for (let n = 0; n < 300; n++) {
    const s: PackSettings = {
      sheetW: 150 + rnd() * 900, sheetH: 150 + rnd() * 900,
      marginTop: rnd() * 20, marginRight: rnd() * 20, marginBottom: rnd() * 20, marginLeft: rnd() * 20,
      gapX: rnd() * 6, gapY: rnd() * 6,
      allowRotate: rnd() > 0.5, arrangeMode: rnd() > 0.5 ? 'mixed' : 'group',
    };
    const designs = 1 + Math.floor(rnd() * 5);
    const uniform = rnd() > 0.4;
    const items = Array.from({ length: designs }, (_, i) =>
      item('d' + i, uniform ? 55.5 : 20 + rnd() * 90, uniform ? 77.25 : 20 + rnd() * 90, 1 + Math.floor(rnd() * 40)));
    const r = planPack(items, s);
    if (r.errors.length) continue; // legitimately too big
    assert.equal(r.placed, r.requested);
    const v = validatePacking({ sheets: r.sheets, items, settings: s });
    assert.deepEqual(v.issues, [], JSON.stringify({ s, items }));
  }
});

test('validator catches overlap, margin and quantity problems', () => {
  const items = [item('a', 50, 50, 2)];
  const mk = (x1: number, y1: number, x2: number, y2: number) => ({
    sheets: [{ index: 0, placements: [
      { sheet: 0, itemId: 'a', copy: 0, x: x1, y: y1, w: 50, h: 50, rotated: false },
      { sheet: 0, itemId: 'a', copy: 1, x: x2, y: y2, w: 50, h: 50, rotated: false },
    ] }], items, settings: base,
  });
  assert.ok(validatePacking(mk(10, 10, 30, 10)).issues.some((i) => /overlap/.test(i.message)));
  assert.ok(validatePacking(mk(10, 10, 61, 10)).issues.some((i) => /spacing/.test(i.message)));
  assert.ok(validatePacking(mk(5, 10, 100, 10)).issues.some((i) => /margins/.test(i.message)));
  assert.equal(validatePacking(mk(10, 10, 63, 10)).ok, true);
  const missing = validatePacking({ ...mk(10, 10, 63, 10), items: [item('a', 50, 50, 3)] });
  assert.ok(missing.issues.some((i) => /2 of 3/.test(i.message)));
});
