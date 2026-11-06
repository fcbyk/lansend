import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 版本号只有一个来源：根目录 package.json 的 version 字段。
//
// 构建时只读不写。版本要跟着提交走 —— 只有在 file 里写死，切回旧提交重建才会
// 得到旧版本号；如果构建时现算，今天重建两年前的提交会得到一个"最新"版本。
const pkgPath = resolve(import.meta.dirname, '..', '..', 'package.json');

// 没有 version 字段时（本方案落地之前的提交）的兜底值，避免构建直接失败。
const FALLBACK_VERSION = '0.1.0';

// 版本号会进 ldflags、Windows 的四段版本资源、macOS 的 plist，
// 所以只接受点分数字：YYYY.M.D，或 1~4 段的数字组合。
const VERSION_PATTERN = /^\d+(\.\d+){0,3}$/;

/** 原样读取 package.json 的 version（不含 v）；没有这个字段时返回 null。 */
function readPackageVersion() {
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  } catch (e) {
    throw new Error(`读取 ${pkgPath} 失败: ${e.message}`);
  }

  const value = typeof pkg.version === 'string' ? pkg.version.trim() : '';
  if (!value) return null;

  // 写错了当场报错，别带着非法版本号去编译：
  // 多打的 v、写成日期的斜线、带后缀的 1.0.0-beta 都会在这里被拦住。
  if (!VERSION_PATTERN.test(value)) {
    throw new Error(`package.json 的 version 必须是点分数字（如 2026.11.6），实际是 "${value}"`);
  }

  return value;
}

/** 构建用：缺字段时回退 0.1.0，不阻断构建。 */
export function readVersion() {
  return readPackageVersion() ?? FALLBACK_VERSION;
}

/** 带 v 前缀，注入 ldflags、页脚、plist 都用它。 */
export function readVersionTag() {
  return `v${readVersion()}`;
}

/**
 * 打标签用：标签名只能来自 package.json。
 *
 * 这里不做回退 —— 缺字段说明版本没写，用兜底值会造出一个和实际版本无关的
 * v0.1.0 标签，比直接失败更糟。
 */
export function requireVersionTag() {
  const value = readPackageVersion();
  if (!value) {
    throw new Error('package.json 缺少 version 字段，无法确定标签名');
  }
  return `v${value}`;
}

/**
 * 短提交哈希；取不到时退回 unknown（源码包解压后构建、还没 git init），
 * 与 Go 侧变量的零值同名，页面据此决定是否隐藏这一段。
 *
 * 时间语义的版本同一天内不变化，同一天发两次只能靠它区分。
 */
export function computeCommitHash() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    console.warn('Warning: could not get git commit hash');
    return 'unknown';
  }
}
