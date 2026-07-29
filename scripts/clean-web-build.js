#!/usr/bin/env node
// public/ffmpeg holds native Windows binaries for the Electron desktop build.
// Vite copies everything under public/ into dist/ verbatim, so strip it back out
// of the web bundle: the browser build uses ffmpeg.wasm instead, and hosts like
// Cloudflare Workers reject individual assets over 25 MiB anyway.

const fs = require('fs')
const path = require('path')

const target = path.join(__dirname, '../dist/ffmpeg')

if (fs.existsSync(target)) {
  fs.rmSync(target, { recursive: true, force: true })
  console.log('Removed dist/ffmpeg (native binaries aren\'t needed for the web build)')
}
