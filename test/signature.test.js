import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { isValidSignature } from '../lib/signature.js';

const sign = (body, secret) => `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;

test('accepts a body signed with the app secret', () => {
  assert.ok(isValidSignature('{"a":1}', sign('{"a":1}', 's3cret'), 's3cret'));
});

test('rejects a wrong secret, a changed body or a missing header', () => {
  assert.ok(!isValidSignature('{"a":1}', sign('{"a":1}', 'other'), 's3cret'));
  assert.ok(!isValidSignature('{"a":2}', sign('{"a":1}', 's3cret'), 's3cret'));
  assert.ok(!isValidSignature('{"a":1}', undefined, 's3cret'));
  assert.ok(!isValidSignature('{"a":1}', 'sha256=abc', 's3cret'));
});
