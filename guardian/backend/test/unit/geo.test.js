import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distanceMeters, evaluateGeofence } from '../../src/lib/geo.js';

const school = { lat: 24.7136, lng: 46.6753, radiusM: 150 };
// ~0.001° latitude ≈ 111 m
const at = (dLatMeters, accuracyM = 10) => ({ lat: school.lat + dLatMeters / 111_195, lng: school.lng, accuracyM });

test('haversine distance is accurate', () => {
  const d = distanceMeters({ lat: 24.7136, lng: 46.6753 }, { lat: 24.7136 + 1 / 111.195, lng: 46.6753 });
  assert.ok(Math.abs(d - 1000) < 1, `got ${d}`);
});

test('enters when clearly inside', () => {
  assert.deepEqual(evaluateGeofence(school, at(50), false), { inside: true, event: 'enter' });
});

test('does not exit on jitter near the boundary', () => {
  assert.deepEqual(evaluateGeofence(school, at(170), true), { inside: true, event: null });
});

test('exits when clearly outside', () => {
  assert.deepEqual(evaluateGeofence(school, at(400), true), { inside: false, event: 'exit' });
});

test('ignores very inaccurate fixes', () => {
  assert.deepEqual(evaluateGeofence(school, at(1000, 800), true), { inside: true, event: null });
});
