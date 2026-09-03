'use strict';

const net = require('node:net');

function normalizeIp(value) {
  const candidate = String(value || '').trim();
  if (!candidate || candidate.includes(',') || net.isIP(candidate) === 0) return null;
  if (candidate.toLowerCase().startsWith('::ffff:')) {
    const mapped = candidate.slice(7);
    if (net.isIP(mapped) === 4) return mapped;
  }
  return candidate.toLowerCase();
}

function requestHeader(req, name) {
  if (typeof req.get === 'function') return req.get(name);
  return req.headers?.[name.toLowerCase()];
}

function resolveClientIp(req, env = process.env) {
  if (env.RAILWAY_ENVIRONMENT_ID) {
    const railwayIp = normalizeIp(requestHeader(req, 'X-Real-IP'));
    if (railwayIp) return railwayIp;
  }
  return normalizeIp(req.socket?.remoteAddress)
    || normalizeIp(req.ip)
    || 'anonymous';
}

module.exports = { normalizeIp, resolveClientIp };
