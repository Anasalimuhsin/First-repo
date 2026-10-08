// Verifiable parental consent (COPPA). A consent record is only created after
// the chosen method is verified.
//
// Implemented methods:
//   card_verification — the parent completes a Stripe SetupIntent in the client
//                       (a card check, no charge); we confirm it succeeded.
//   dev_attestation   — checkbox only. Refused when NODE_ENV=production.
//
// Other FTC-accepted methods (signed form review, ID check, video call) are
// manual: an admin verifies and records them with method 'manual_review'.

import { HttpError } from './errors.js';

export const CONSENT_METHODS = ['card_verification', 'dev_attestation', 'manual_review'];

export function createConsentVerifier({ env = process.env, fetchImpl = fetch } = {}) {
  return {
    async verify({ method, verificationRef }) {
      switch (method) {
        case 'dev_attestation':
          if (env.NODE_ENV === 'production') {
            throw new HttpError(400, 'dev_attestation is not allowed in production');
          }
          return;

        case 'card_verification': {
          if (!env.STRIPE_SECRET_KEY) throw new HttpError(503, 'Card verification is not configured');
          if (!/^seti_[A-Za-z0-9]+$/.test(verificationRef ?? '')) {
            throw new HttpError(400, 'verificationRef must be a Stripe SetupIntent id');
          }
          const res = await fetchImpl(`https://api.stripe.com/v1/setup_intents/${verificationRef}`, {
            headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
          });
          if (!res.ok) throw new HttpError(400, 'Could not verify card check');
          const intent = await res.json();
          if (intent.status !== 'succeeded') throw new HttpError(400, 'Card check has not succeeded');
          return;
        }

        case 'manual_review':
          // Only admins may record this; parent-facing routes never accept it.
          throw new HttpError(403, 'manual_review consents are recorded by staff');

        default:
          throw new HttpError(400, `Unknown consent method "${method}"`);
      }
    },
  };
}
