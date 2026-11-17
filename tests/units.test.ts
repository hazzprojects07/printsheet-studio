import test from 'node:test';
import assert from 'node:assert/strict';
import { PT_PER_MM, formatNumber, fromMm, toMm } from '../src/lib/units';

test('unit conversions round-trip', () => {
  assert.equal(toMm(4.5, 'in'), 114.3);
  assert.equal(toMm(1, 'ft'), 304.8);
  assert.equal(toMm(10, 'cm'), 100);
  assert.ok(Math.abs(fromMm(114.3, 'in') - 4.5) < 1e-12);
});

test('4.5 inch card is 324 pt', () => {
  assert.ok(Math.abs(114.3 * PT_PER_MM - 324) < 1e-9);
});

test('formatNumber trims zeros', () => {
  assert.equal(formatNumber(114.3, 2), '114.3');
  assert.equal(formatNumber(3, 2), '3');
});
