import { execSync } from 'child_process';

// 版本号唯一来源：当前 HEAD 的提交时间（committer date，UTC），与构建时间无关。
//
// 同一个 commit 永远得到同一个版本：今天重建两年前的 commit，得到的是两年前的
// 时间版本，而不是"最新"版本。tag 只作发布触发器，不参与版本计算。
//
// 格式：YYYY.MMDD.HHMM —— 年、月*100+日、时*100+分。
// 计算时各段补零，输出时去掉前导零（按整数拼接天然没有前导零）：
//   2026.101.0      → 1 月 1 日 00:00 UTC
//   2026.111.5      → 1 月 11 日 00:05 UTC
//   2026.1101.103   → 11 月 1 日 01:03 UTC
// 三段数字同时满足 Windows PE、macOS plist 与 semver 的格式要求。
const FALLBACK_VERSION = '0.0.0';

// 拿不到 git 信息（源码 zip、没有 HEAD）时返回 null。
function readCommitEpoch() {
  try {
    const raw = execSync('git show -s --format=%ct HEAD', { encoding: 'utf8' }).trim();
    const epoch = Number.parseInt(raw, 10);
    return Number.isFinite(epoch) ? epoch : null;
  } catch {
    return null;
  }
}

function formatVersion(epoch) {
  const d = new Date(epoch * 1000);
  const year = d.getUTCFullYear();
  const monthDay = (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  const hourMinute = d.getUTCHours() * 100 + d.getUTCMinutes();
  return `${year}.${monthDay}.${hourMinute}`;
}

/** 构建用：没有 git 信息时回退 0.0.0，不阻断构建。 */
export function readVersion() {
  const epoch = readCommitEpoch();
  return epoch === null ? FALLBACK_VERSION : formatVersion(epoch);
}

/** 带 v 前缀，注入 ldflags、页脚、plist 都用它。 */
export function readVersionTag() {
  return `v${readVersion()}`;
}

/** 打标签用：拿不到 commit 时间就失败，不用兜底值造一个假标签。 */
export function requireVersionTag() {
  const epoch = readCommitEpoch();
  if (epoch === null) {
    throw new Error('无法读取当前 HEAD 的提交时间（不在 git 仓库或没有提交），无法确定版本号');
  }
  return `v${formatVersion(epoch)}`;
}

/**
 * 短提交哈希；取不到时退回 unknown（源码包解压后构建、还没 git init），
 * 与 Go 侧变量的零值同名，页面据此决定是否隐藏这一段。
 *
 * 版本精确到分钟，同一分钟内的多个提交只能靠它区分。
 */
export function computeCommitHash() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    console.warn('Warning: could not get git commit hash');
    return 'unknown';
  }
}
