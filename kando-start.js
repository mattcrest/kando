#!/usr/bin/env node

import { spawn } from 'child_process';
import { execSync } from 'child_process';
import http from 'http';

const PORT = 3001;
const URL = `http://localhost:${PORT}`;
let server;

// Start the Node server
console.log('Starting Kando server...');
server = spawn('node', ['electron/server.js'], {
  stdio: 'inherit',
  cwd: process.cwd()
});

// Wait for server to be ready, then open browser
let attempts = 0;
const maxAttempts = 30;

const checkServer = setInterval(() => {
  attempts++;

  http.get(`${URL}/api/health`, (res) => {
    if (res.statusCode === 200) {
      clearInterval(checkServer);
      console.log(`\n✓ Kando is ready at ${URL}`);
      console.log('Opening browser...\n');

      // Open in default browser
      try {
        execSync(`open "${URL}"`, { stdio: 'ignore' });
      } catch (e) {
        console.log(`Open browser manually at ${URL}`);
      }
    }
  }).on('error', () => {
    if (attempts >= maxAttempts) {
      clearInterval(checkServer);
      console.error('Server failed to start');
      process.exit(1);
    }
  });
}, 100);

// Handle shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down Kando...');
  server.kill();
  process.exit(0);
});

server.on('exit', () => {
  clearInterval(checkServer);
  process.exit(0);
});
