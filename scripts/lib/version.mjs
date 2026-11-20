import { execSync } from 'child_process';

// 版本号唯一来源：当前 HEAD 的提交时间（committer date），与构建时间无关。
//
// 同一个 commit 永远得到同一个版本：今天重建两年前的 commit，得到的是两年前的
// 日期版本，而不是"最新"版本。tag 只作发布触发器，不参与版本计算。
//
// 时间固定按北京时间（UTC+8，无夏令时）换算。不能用宿主本地时区：CI 跑在 UTC，
// 本地在 +08，跨天时同一个 commit 会算出两个版本，标签和 CI 断言都会对不上。
// 这个时区是永久约定，改了它等于改掉所有历史 commit 的版本号。
//
// 格式：YYYY.M.D —— 年、月、日，各段去前导零：
//   2026.1.1    → 2026 年 1 月 1 日
//   2026.11.20  → 2026 年 11 月 20 日
// 同一天内的多个提交版本相同，靠短哈希区分；同日重发先删除旧 tag / Release。
// 三段数字同时满足 Windows PE、macOS plist 与 semver 的格式要求。
const FALLBACK_VERSION = '0.0.0';

// 固定 UTC+8，和宿主时区、CI 机器的时区都无关。
const VERSION_TZ_OFFSET_MS = 8 * 60 * 60 * 1000;

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
  const d = new Date(epoch * 1000 + VERSION_TZ_OFFSET_MS);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return `${year}.${month}.${day}`;
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
 * 版本只精确到天，同一天内的多个提交只能靠它区分。
 */
export function computeCommitHash() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    console.warn('Warning: could not get git commit hash');
    return 'unknown';
  }
}
