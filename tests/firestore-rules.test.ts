import { beforeAll, afterAll, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import * as fs from 'node:fs';
import { join } from 'node:path';

let testEnv: RulesTestEnvironment;

const MENU_ITEM_PATH = 'companies/demo-company/branches/demo-branch/menuItems/item-1';
const BASKET_PATH =
  'companies/demo-company/branches/demo-branch/sessions/session-1/baskets/user-1';

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-qraving',
    firestore: {
      rules: fs.readFileSync(join(process.cwd(), 'firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('Firestore security rules', () => {
  it('allows unauthenticated read of menuItems', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    const ref = doc(db, MENU_ITEM_PATH);
    await assertSucceeds(getDoc(ref));
  });

  it('denies unauthenticated write to menuItems', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    const ref = doc(db, MENU_ITEM_PATH);
    await assertFails(setDoc(ref, { name: 'Test Item' }));
  });

  it('allows authenticated write to menuItems', async () => {
    const db = testEnv.authenticatedContext('admin-uid').firestore();
    const ref = doc(db, MENU_ITEM_PATH);
    await assertSucceeds(setDoc(ref, { name: 'Test Item' }));
  });

  it('allows unauthenticated read of baskets sub-document', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    const ref = doc(db, BASKET_PATH);
    await assertSucceeds(getDoc(ref));
  });

  it('allows unauthenticated write to baskets sub-document', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    const ref = doc(db, BASKET_PATH);
    await assertSucceeds(setDoc(ref, { name: 'Alice', phone: '555-1234', items: [] }));
  });
});
