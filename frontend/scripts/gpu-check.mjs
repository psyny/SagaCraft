#!/usr/bin/env node
/**
 * Builds every WebGL shader the app uses (maps, EFX, dice) under each graphics backend Chrome can use on this
 * machine, through gpu-check.html, and reports what fails. A shader that works on one platform can fail on another:
 * Windows browsers translate WebGL to Direct3D, macOS to Metal, Linux and Android to OpenGL or Vulkan, and machines
 * without a usable GPU draw in software (SwiftShader).
 *
 *   node scripts/gpu-check.mjs [url]     (default http://localhost:3100/gpu-check.html: the dev server must run)
 *
 * Exit code 1 when a check fails on a backend that works here (backends this machine can't run are skipped).
 */
import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const url = process.argv[2] || 'http://localhost:3100/gpu-check.html'

const BROWSERS = {
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ],
  linux: ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'],
}

// ANGLE backends per OS: what real users' browsers run on there (and software rendering everywhere)
const BACKENDS = {
  win32: [['d3d11', 'Direct3D 11 (Windows)'], ['d3d9', 'Direct3D 9 (old Windows GPUs)'], ['gl', 'OpenGL'], ['vulkan', 'Vulkan (Android-like)'], ['swiftshader', 'software (no GPU)']],
  darwin: [['metal', 'Metal (macOS, iOS-like)'], ['gl', 'OpenGL (older macOS)'], ['swiftshader', 'software (no GPU)']],
  linux: [['gl', 'OpenGL (Linux)'], ['vulkan', 'Vulkan (Linux, Android-like)'], ['swiftshader', 'software (no GPU)']],
}

const browser = (BROWSERS[process.platform] || []).find((path) => existsSync(path))
if (!browser) {
  console.error('No Chrome, Edge or Chromium found.')
  process.exit(2)
}

function run(angle) {
  const profile = mkdtempSync(join(tmpdir(), 'gpu-check-'))
  const args = [
    '--headless=new', '--disable-extensions', '--no-first-run', `--user-data-dir=${profile}`,
    '--ignore-gpu-blocklist', '--enable-gpu', `--use-angle=${angle}`,
    ...(angle === 'swiftshader' ? ['--enable-unsafe-swiftshader'] : []),
    '--virtual-time-budget=60000', '--dump-dom', url,
  ]
  return new Promise((resolve) => {
    execFile(browser, args, { maxBuffer: 32 * 1024 * 1024, timeout: 180000 }, (error, stdout, stderr) => {
      rmSync(profile, { recursive: true, force: true })
      const crashed = /GPU process exited unexpectedly/.test(stderr)
      const marker = stdout.match(/GPU-CHECK-DONE (\{.*\})/)
      const text = stdout.replace(/[\s\S]*<pre id="out">/, '').replace(/<\/pre>[\s\S]*/, '').replace(/<[^>]+>/g, '')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
      resolve({ result: marker ? JSON.parse(marker[1]) : null, text, crashed, error })
    })
  })
}

let failed = false
console.log(`Browser: ${browser}\nPage: ${url}\n`)
for (const [angle, label] of BACKENDS[process.platform] || []) {
  const { result, text, crashed } = await run(angle)
  if (!result) {
    console.log(`-- ${label}: no result (the page didn't finish${crashed ? '; the GPU process crashed' : ''})`)
    failed = true
    continue
  }
  // A backend this machine can't use falls back to another one: report it, don't fail on it
  const wanted = { d3d11: /Direct3D11/i, d3d9: /Direct3D9/i, gl: /OpenGL/i, vulkan: /Vulkan/i, swiftshader: /SwiftShader/i, metal: /Metal/i }[angle]
  if (!wanted.test(result.renderer)) {
    console.log(`-- ${label}: not available here (got ${result.renderer}), skipped`)
    continue
  }
  const bad = result.failing
  console.log(`-- ${label}: ${bad.length ? `${bad.length} FAILING` : 'all ok'}${crashed ? ' (the GPU process crashed)' : ''}\n   ${result.renderer}`)
  if (bad.length) {
    failed = true
    for (const line of text.split('\n').filter((l) => l.startsWith('FAIL'))) console.log(`   ${line}`)
  }
}
process.exit(failed ? 1 : 0)
