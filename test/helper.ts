import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
export const __dirname = path.dirname(__filename);

export function getFixturesFile(filename: string) {
  return path.join(__dirname, 'fixtures', filename);
}

export function readFixturesFile(filename: string, encoding: 'ascii' | 'utf-8' = 'ascii') {
  return readFileSync(getFixturesFile(filename), encoding);
}

export const APP_ID = '2021000122671080';
export const GATE_WAY = 'https://openapi-sandbox.dl.alipaydev.com/gateway.do';

export const STABLE_APP_ID = '2014060600164699';
export const STABLE_GATE_WAY = 'http://openapi.stable.dl.alipaydev.com/gateway.do';
export const STABLE_ENDPOINT = 'http://openapi.stable.dl.alipaydev.com';
export const STABLE_APP_PRIVATE_KEY =
  readFixturesFile('app_2014060600164699_rsa2_private_key_no_wrapper.pem', 'ascii');
export const STABLE_APP_PUBLIC_KEY =
  readFixturesFile('app_2014060600164699_rsa2_public_key_no_wrapper.pem', 'ascii');
export const STABLE_ALIPAY_PUBLIC_KEY =
  readFixturesFile('alipay_stable_rsa2_public_key.pem', 'ascii');
