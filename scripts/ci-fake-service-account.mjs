// Prints a throwaway Firebase service-account JSON for CI builds.
// lib/firebase-admin.ts requires FIREBASE_SERVICE_ACCOUNT_JSON at import time,
// and `next build` imports every route while collecting page data. The key is
// freshly generated and grants access to nothing.
import { generateKeyPairSync } from 'node:crypto';

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

process.stdout.write(
  JSON.stringify({
    type: 'service_account',
    project_id: 'qraving-ci',
    private_key_id: 'ci',
    private_key: privateKey,
    client_email: 'ci@qraving-ci.iam.gserviceaccount.com',
    client_id: '0',
  }),
);
