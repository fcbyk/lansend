import { Call, Events } from '@wailsio/runtime'

const el = (id) => document.getElementById(id)

const ui = {
  status: el('status'),
  directory: el('directory'),
  pick: el('pick'),
  port: el('port'),
  download: el('download'),
  upload: el('upload'),
  chat: el('chat'),
  urls: el('urls'),
  toggle: el('toggle'),
  error: el('error'),
  hint: el('hint'),
}

const call = (method, ...args) => Call.ByName(`main.Controller.${method}`, ...args)

// 图标按钮：条目多时比文字按钮安静得多，功能靠 title 提示。
const ICON_COPY = `<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="6" y="6" width="7.5" height="7.5" rx="1.6"/><path d="M10.5 3.9v-.5A1.4 1.4 0 0 0 9.1 2H3.9a1.4 1.4 0 0 0-1.4 1.4v5.2A1.4 1.4 0 0 0 3.9 10h.6"/></svg>`
const ICON_OPEN = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9.2 2.8h4v4"/><path d="M13.2 2.8 7.6 8.4"/><path d="M12.4 9.8v2.2a1.4 1.4 0 0 1-1.4 1.4H4.4A1.4 1.4 0 0 1 3 12.1V5.5a1.4 1.4 0 0 1 1.4-1.4h2.2"/></svg>`

function iconButton(action, title, url, svg) {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'icon-btn'
  btn.dataset.action = action
  btn.dataset.url = url
  btn.title = title
  btn.setAttribute('aria-label', title)
  btn.innerHTML = svg
  return btn
}

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
      url.title = item.url

      const actions = document.createElement('div')
      actions.className = 'actions'
      actions.append(
        iconButton('copy', '复制地址', item.url, ICON_COPY),
        iconButton('open', '在浏览器打开', item.url, ICON_OPEN),
      )

      li.append(iface, url, actions)
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
  ui.toggle.classList.toggle('primary', !next.running)
  ui.toggle.classList.toggle('danger', next.running)

  if (next.error) {
    showError(next.error)
  } else {
    clearError()
  }

  applyBusy()
}

function applyBusy() {
  const running = view ? view.running : false

  let hint = '选择目录与端口后，点击「启动服务」'
  if (busy) {
    hint = '处理中…'
  } else if (running) {
    hint = `本机访问 ${view.localUrl}`
  }
  ui.hint.textContent = hint

  ui.pick.disabled = busy
  ui.port.disabled = busy
  ui.download.disabled = busy
  ui.upload.disabled = busy
  ui.chat.disabled = busy
  ui.toggle.disabled = busy

  // 地址行是每次渲染重建的，按当前 DOM 统一禁用
  for (const btn of ui.urls.querySelectorAll('.icon-btn')) {
    btn.disabled = busy || !running
  }
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

ui.port.addEventListener('change', () => {
  const port = Number.parseInt(ui.port.value, 10)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    showError('端口必须是 1 - 65535 之间的整数')
    if (view) ui.port.value = String(view.port)
    return
  }
  // 值没变就不必重建服务
  if (view && port === view.port) {
    clearError()
    return
  }
  run(async () => {
    await call('SetPort', port)
    await refresh()
  })
})

// 回车即提交：失焦会触发 change，避免再点一次别处
ui.port.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') ui.port.blur()
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

// 地址行内的图标按钮用事件委托，行是动态重建的
ui.urls.addEventListener('click', (event) => {
  const btn = event.target.closest('.icon-btn')
  if (!btn || btn.disabled) return

  const isCopy = btn.dataset.action === 'copy'
  run(async () => {
    await call(isCopy ? 'CopyURL' : 'OpenInBrowser', btn.dataset.url)
    if (isCopy) {
      btn.classList.add('done')
      setTimeout(() => btn.classList.remove('done'), 1200)
    }
  })
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
