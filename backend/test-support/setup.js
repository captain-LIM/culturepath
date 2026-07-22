'use strict';

const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const tls = require('node:tls');

// 기본 테스트는 실제 서비스 키와 네트워크를 절대 사용하지 않는다.
const blockedEnvironmentVariables = [
  'TOUR_API_KEY',
  'OPENROUTER_API_KEY',
  'ANTHROPIC_API_KEY',
  'QDRANT_API_KEY',
  'QDRANT_URL',
  'RAG_API_URL',
  'DB_HOST',
  'DB_PORT',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
];

process.env.NODE_ENV = 'test';
process.env.USE_MOCK_RAG = 'true';
process.env.RUN_LIVE_API_SMOKE = '0';
process.env.JWT_SECRET = 'test-only-secret';
process.env.JWT_EXPIRES_IN = '1h';

for (const name of blockedEnvironmentVariables) {
  // dotenv는 이미 존재하는 환경변수를 기본적으로 덮어쓰지 않으므로 빈 값으로 선점한다.
  process.env[name] = '';
}

const networkBlockedMessage =
  'Network access is blocked in default tests. Use an explicitly approved local smoke test.';

function blockNetworkAccess() {
  throw new Error(networkBlockedMessage);
}

globalThis.fetch = async function blockedFetch() {
  throw new Error(networkBlockedMessage);
};

http.request = blockNetworkAccess;
http.get = blockNetworkAccess;
https.request = blockNetworkAccess;
https.get = blockNetworkAccess;
net.connect = blockNetworkAccess;
net.createConnection = blockNetworkAccess;
net.Socket.prototype.connect = blockNetworkAccess;
tls.connect = blockNetworkAccess;

globalThis.__CULTUREPATH_TEST_GUARD__ = Object.freeze({
  blockedEnvironmentVariables,
  liveApiEnabled: false,
  networkBlockedMessage,
});
