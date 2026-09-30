// api/index.js - Vercel Serverless Function Entrypoint
// This file imports from the pre-built dist/ folder to ensure path aliases are resolved
const express = require('express');
const { ExpressAdapter } = require('@nestjs/platform-express');

// Lazy-initialize the Nest app once and reuse across invocations
let cachedHandler = null;

async function getHandler() {
  if (cachedHandler) {
    return cachedHandler;
  }

  const server = express();
  const expressAdapter = new ExpressAdapter(server);

  // Import bootstrap from compiled dist folder
  const { createNestApp } = require('../dist/bootstrap');
  await createNestApp({ expressAdapter });

  cachedHandler = server;
  return server;
}

module.exports = async function handler(req, res) {
  try {
    const server = await getHandler();
    return server(req, res);
  } catch (err) {
    console.error('[api/index] bootstrap failed', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        status: 'error',
        message: 'Server failed to start',
        statusCode: 500,
      }),
    );
  }
};
