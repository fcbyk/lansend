#!/usr/bin/env node
import path from 'node:path'
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { createConfig } from './utils/config.js'
import { getPrivateNetworks, ensurePortAvailable } from './utils/network.js'
import { startWebServer } from './app.js'
import { FileShareService } from './services/fileShare.service.js'

const HELP = `Usage: lansend [options]

Start a local web server for sharing files over LAN.

Options:
  -p  --port <number>     Web server port (default: 80)
  -d  --directory <path>  Directory to share (default: .)
  -ap --ask-password      Prompt to set upload password
  -nb --no-browser        Disable automatic browser opening
  -nd --hide-download     Hide download buttons in directory tab
  -nu --disable-upload    Disable upload functionality
      --chat              Enable chat functionality
  -h  --help              Show this help message
`

interface LaunchOptions {
  port: number
  directory: string
  askPassword: boolean
  noBrowser: boolean
  hideDownload: boolean
  disableUpload: boolean
  chat: boolean
}

function parseArgs(argv: string[]): LaunchOptions {
  const options: LaunchOptions = {
    port: 80,
    directory: '.',
    askPassword: false,
    noBrowser: false,
    hideDownload: false,
    disableUpload: false,
    chat: false,
  }

  const args = argv.slice(2)
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    switch (arg) {
      case '-h':
      case '--help':
        console.log(HELP)
        process.exit(0)

      case '-p':
      case '--port':
        options.port = parseInt(args[++i], 10)
        if (isNaN(options.port) || options.port < 1) {
          console.error('Error: port must be a positive integer')
          process.exit(1)
        }
        break

      case '-d':
      case '--directory':
        options.directory = args[++i] || '.'
        break

      case '-ap':
      case '--ask-password':
        options.askPassword = true
        break

      case '-nb':
      case '--no-browser':
        options.noBrowser = true
        break

      case '-nd':
      case '--hide-download':
        options.hideDownload = true
        break

      case '-nu':
      case '--disable-upload':
        options.disableUpload = true
        break

      case '--chat':
        options.chat = true
        break

      default:
        if (arg.startsWith('-')) {
          console.error(`Error: unknown option: ${arg}`)
          console.error(`Run lansend --help for usage.`)
          process.exit(1)
        }
        break
    }
  }

  return options
}

function resolveDirectory(dir: string): string {
  const resolved = path.resolve(dir)
  try {
    const stat = fs.statSync(resolved)
    if (!stat.isDirectory()) {
      console.error(`Error: "${dir}" is not a directory`)
      process.exit(1)
    }
    return resolved
  } catch {
    console.error(`Error: directory "${dir}" does not exist`)
    process.exit(1)
  }
}

function promptUploadPassword(askPassword: boolean, disableUpload: boolean): string | null {
  if (disableUpload) return null
  if (!askPassword) return null
  return '123456'
}

function printServerSummary(
  sharedDirectory: string,
  port: number,
  networks: ReturnType<typeof getPrivateNetworks>,
  uploadPasswordEnabled: boolean,
): string | null {
  console.log(`\n  Shared directory: ${sharedDirectory}`)
  console.log(`  Port: ${port}`)
  if (uploadPasswordEnabled) {
    console.log(`  Upload password: 123456`)
  }
  console.log()

  for (const host of ['localhost', '127.0.0.1']) {
    console.log(`  Local: http://${host}:${port}`)
  }

  for (const net of networks) {
    if (net.virtual) continue
    for (const ip of net.ips) {
      if (ip === '127.0.0.1') continue
      console.log(`  [${net.iface}] Network URL: http://${ip}:${port}`)
    }
  }
  console.log()

  const firstIp = networks.find((n) => !n.virtual)?.ips?.[0]
  if (firstIp) {
    return `http://${firstIp}:${port}`
  }
  return `http://localhost:${port}`
}

async function waitForServerReady(port: number, host = '127.0.0.1', timeout = 10.0): Promise<boolean> {
  const url = `http://${host}:${port}/`
  const deadline = Date.now() + timeout * 1000
  while (Date.now() < deadline) {
    try {
      const resp = await fetch(url)
      if (resp.status === 200) return true
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 50))
  }
  return false
}

async function copyUrlToClipboard(url: string): Promise<void> {
  try {
    const clipboardy = await import('clipboardy')
    clipboardy.default.writeSync(url)
    console.log(`  URL has been copied to clipboard`)
  } catch {
    console.log(`  Warning: Could not copy URL to clipboard`)
  }
}

async function openBrowser(url: string): Promise<void> {
  const platform = process.platform
  let cmd: string
  let args: string[]
  if (platform === 'darwin') {
    cmd = 'open'
    args = [url]
  } else if (platform === 'win32') {
    cmd = 'cmd'
    args = ['/c', 'start', '""', url]
  } else {
    cmd = 'xdg-open'
    args = [url]
  }
  try {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore' })
    child.unref()
  } catch {
    console.log(`  Warning: Could not open browser automatically`)
  }
}

function buildConfig(options: LaunchOptions) {
  const sharedDirectory = resolveDirectory(options.directory)
  const uploadPassword = promptUploadPassword(options.askPassword, options.disableUpload)
  return createConfig({
    directory: sharedDirectory,
    uploadPassword,
    hideDownload: options.hideDownload,
    disableUpload: options.disableUpload,
    chat: options.chat,
  })
}

async function runLansend(options: LaunchOptions) {
  const config = buildConfig(options)

  try {
    ensurePortAvailable(options.port)
  } catch (e) {
    console.error(`  Error: Port ${options.port} is already in use (or you don't have permission).`)
    console.error(`  Please choose another port (e.g. --port ${options.port + 1}).`)
    console.error(`  Details: ${e}\n`)
    process.exit(1)
  }

  const networks = getPrivateNetworks()
  const url = printServerSummary(
    config.sharedDirectory,
    options.port,
    networks,
    !!config.uploadPassword,
  )

  const fileService = new FileShareService(config)

  if (!options.noBrowser && url) {
    const app = await startWebServer(options.port, fileService, false)
    if (!app) return

    const { serve } = await import('@hono/node-server')
    serve(
      { fetch: app.fetch, port: options.port, hostname: '0.0.0.0' },
      async () => {
        if (await waitForServerReady(options.port)) {
          await copyUrlToClipboard(url)
          await openBrowser(url)
        }
      },
    )
  } else {
    await startWebServer(options.port, fileService)
  }
}

const options = parseArgs(process.argv)
runLansend(options)