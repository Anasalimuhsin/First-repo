import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize } from '../../src/analyzer/normalize.js';

test('removes Arabic diacritics and tatweel', () => {
  assert.equal(normalize('مَـــوْت'), 'موت');
});

test('unifies alef, ya and ta marbuta variants', () => {
  assert.equal(normalize('إنتحار'), 'انتحار');
  assert.equal(normalize('أريد'), 'اريد');
  assert.equal(normalize('مدرسة'), 'مدرسه');
  assert.equal(normalize('على'), 'علي');
});

test('collapses stretched letters', () => {
  assert.equal(normalize('مووووت'), 'موت');
  assert.equal(normalize('noooo way'), 'no way');
});

test('decodes leetspeak only inside words with letters', () => {
  assert.equal(normalize('k1ll y0ur5elf'), 'kill yourself');
  assert.equal(normalize('class of 2024'), 'class of 2024');
});

test('strips punctuation and emoji', () => {
  assert.equal(normalize('go die!!! 😡😡'), 'go die');
});
