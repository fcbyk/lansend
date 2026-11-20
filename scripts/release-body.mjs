import { execFileSync } from 'child_process';
import { requireVersionTag } from './lib/version.mjs';

// 生成 Release 正文：Full Changelog → 下载表 → 平台说明。
// 下载链接指向当前 tag 的资产，不依赖 README，也不指向 latest。
// CI 在 tag checkout 上运行，当前标签来自 GITHUB_REF_NAME；本地预览时取 HEAD 上的标签。

const repo = process.env.GITHUB_REPOSITORY || 'fcbyk/lansend';
const baseUrl = `https://github.com/${repo}`;

function gitDescribe(...args) {
  return execFileSync('git', ['describe', '--tags', '--abbrev=0', '--match', 'v*', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

function currentTag() {
  if (process.env.GITHUB_REF_NAME) return process.env.GITHUB_REF_NAME;
  try {
    return gitDescribe('--exact-match', 'HEAD');
  } catch {
    // 本地预览、HEAD 还没打标签时，用将要发布的版本号
    return requireVersionTag();
  }
}

function previousTag(current) {
  try {
    return gitDescribe(`${current}^`);
  } catch {
    // 本地预览时当前 tag 可能还没打，退回到 HEAD 附近的标签
    try {
      return gitDescribe('HEAD^');
    } catch {
      return '';
    }
  }
}

const current = currentTag();
const prev = previousTag(current);
const asset = (name) => `[${name}](${baseUrl}/releases/download/${current}/${name})`;

const lines = [];
if (prev && prev !== current) {
  lines.push(`Full Changelog: [${prev}...${current}](${baseUrl}/compare/${prev}...${current})`, '');
}
lines.push(
  '| 平台 | CLI | 桌面端（GUI） |',
  '|------|-----|------|',
  `| macOS (Apple Silicon) | ${asset('lansend-darwin-arm64.tar.gz')} | ${asset('lansend-desktop-darwin-arm64.zip')} |`,
  `| macOS (Intel) | ${asset('lansend-darwin-x86_64.tar.gz')} | ${asset('lansend-desktop-darwin-x86_64.zip')} |`,
  `| Windows (x64) | ${asset('lansend-windows-x64.zip')} | ${asset('lansend-desktop-windows-x64.zip')} |`,
  `| Linux (x86_64) | ${asset('lansend-linux-x86_64.tar.gz')} | — |`,
  `| Linux (ARM64) | ${asset('lansend-linux-arm64.tar.gz')} | — |`,
  '',
  `[checksums.txt](${baseUrl}/releases/download/${current}/checksums.txt)`,
  '',
  '- macOS 桌面端要求 macOS 11 (Big Sur) 及以上；更老的系统请使用 CLI。',
  '- Linux 不提供桌面端：Wails 的 GTK 后端仍是实验状态，且托盘依赖桌面环境提供 StatusNotifier 宿主，GNOME 默认没有。',
  '- 两个桌面包都没有代码签名。macOS 首次打开会被 Gatekeeper 拦下，右键「打开」或执行 `xattr -cr LANSend.app`；Windows 会弹 SmartScreen 提示，点「更多信息 → 仍要运行」。',
);

process.stdout.write(lines.join('\n') + '\n');