import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createConsentVerifier } from '../../src/lib/consentVerifier.js';

test('dev attestation allowed outside production only', async () => {
  await createConsentVerifier({ env: { NODE_ENV: 'development' } }).verify({ method: 'dev_attestation' });
  await assert.rejects(createConsentVerifier({ env: { NODE_ENV: 'production' } }).verify({ method: 'dev_attestation' }), /not allowed/);
});

test('card verification checks the Stripe SetupIntent status', async () => {
  const fetchImpl = async (url, init) => {
    assert.match(url, /setup_intents\/seti_123$/);
    assert.equal(init.headers.authorization, 'Bearer sk_test');
    return new Response(JSON.stringify({ status: url.includes('seti_123') ? 'succeeded' : 'requires_action' }));
  };
  const verifier = createConsentVerifier({ env: { STRIPE_SECRET_KEY: 'sk_test' }, fetchImpl });
  await verifier.verify({ method: 'card_verification', verificationRef: 'seti_123' });
  await assert.rejects(verifier.verify({ method: 'card_verification', verificationRef: 'bogus' }), /SetupIntent/);
});

test('manual review cannot be self-asserted by parents', async () => {
  await assert.rejects(createConsentVerifier({ env: {} }).verify({ method: 'manual_review' }), /staff/);
});
