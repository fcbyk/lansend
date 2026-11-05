import { Call, Events } from '@wailsio/runtime'

const el = (id) => document.getElementById(id)

const ui = {
  status: el('status'),
  directory: el('directory'),
  pick: el('pick'),
  port: el('port'),
  applyPort: el('apply-port'),
  download: el('download'),
  upload: el('upload'),
  chat: el('chat'),
  urls: el('urls'),
  copy: el('copy'),
  open: el('open'),
  toggle: el('toggle'),
  error: el('error'),
  hint: el('hint'),
}

const call = (method, ...args) => Call.ByName(`main.Controller.${method}`, ...args)

let busy = false
let view = null

function errorText(e) {
  if (!e) return '未知错误'
  if (typeof e === 'string') return e
  if (e.message) return e.message
  return String(e)
}

function showError(message) {
  ui.error.textContent = message
  ui.error.hidden = false
}

function clearError() {
  ui.error.textContent = ''
  ui.error.hidden = true
}

function render(next) {
  view = next

  ui.status.textContent = next.running ? '运行中' : '已停止'
  ui.status.classList.toggle('on', next.running)

  ui.directory.value = next.directory
  if (document.activeElement !== ui.port) {
    ui.port.value = String(next.port)
  }

  ui.download.checked = next.downloadEnabled
  ui.upload.checked = next.uploadEnabled
  ui.chat.checked = next.chatEnabled

  ui.urls.textContent = ''
  if (!next.running) {
    const li = document.createElement('li')
    li.className = 'empty'
    li.textContent = '服务未启动'
    ui.urls.appendChild(li)
  } else {
    for (const item of next.urls) {
      const li = document.createElement('li')

      const iface = document.createElement('span')
      iface.className = 'iface'
      iface.textContent = item.iface

      const url = document.createElement('span')
      url.className = 'url'
      url.textContent = item.url

      li.append(iface, url)
      ui.urls.appendChild(li)
    }
    if (next.urls.length === 0) {
      const li = document.createElement('li')
      li.className = 'empty'
      li.textContent = '未检测到局域网地址'
      ui.urls.appendChild(li)
    }
  }

  ui.toggle.textContent = next.running ? '停止服务' : '启动服务'
  ui.hint.textContent = next.running ? `本机访问 ${next.localUrl}` : ''

  if (next.error) {
    showError(next.error)
  } else {
    clearError()
  }

  applyBusy()
}

function applyBusy() {
  const running = view ? view.running : false
  const busyHint = busy ? '处理中…' : ''

  ui.hint.textContent = busyHint || (running ? `本机访问 ${view.localUrl}` : '')

  ui.pick.disabled = busy
  ui.applyPort.disabled = busy
  ui.download.disabled = busy
  ui.upload.disabled = busy
  ui.chat.disabled = busy
  ui.toggle.disabled = busy
  ui.copy.disabled = busy || !running
  ui.open.disabled = busy || !running
}

async function run(fn) {
  if (busy) return
  busy = true
  applyBusy()
  try {
    await fn()
    clearError()
  } catch (e) {
    showError(errorText(e))
  } finally {
    busy = false
    applyBusy()
  }
}

const refresh = async () => render(await call('GetState'))

ui.pick.addEventListener('click', () => {
  run(async () => {
    const dir = await call('PickDirectory')
    if (dir) await refresh()
  })
})

ui.applyPort.addEventListener('click', () => {
  const port = Number.parseInt(ui.port.value, 10)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    showError('端口必须是 1 - 65535 之间的整数')
    return
  }
  run(async () => {
    await call('SetPort', port)
    await refresh()
  })
})

for (const [name, input] of [
  ['download', ui.download],
  ['upload', ui.upload],
  ['chat', ui.chat],
]) {
  input.addEventListener('change', () => {
    const enabled = input.checked
    run(async () => {
      await call('SetFeature', name, enabled)
      await refresh()
    })
  })
}

ui.toggle.addEventListener('click', () => {
  const running = view ? view.running : false
  run(async () => {
    await (running ? call('Stop') : call('Start'))
    await refresh()
  })
})

ui.copy.addEventListener('click', () => {
  run(() => call('CopyURL'))
})

ui.open.addEventListener('click', () => {
  run(() => call('OpenInBrowser'))
})

Events.On('state', (event) => {
  if (event && event.data) render(event.data)
})

async function init() {
  // 运行时可能比页面稍晚就绪，短暂重试后再报错。
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      render(await call('GetState'))
      return
    } catch (e) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }
  showError('无法连接到后端服务')
}

init()
