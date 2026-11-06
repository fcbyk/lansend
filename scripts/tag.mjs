import { execSync } from 'child_process';
import { requireVersionTag } from './lib/version.mjs';

// 只做一件事：按 package.json 的版本号在当前 HEAD 上打标签。
//
// 不改文件、不提交 —— 版本号由人手动改，脚本不替人做决定。
// 缺 version 字段时 requireVersionTag 会直接抛错，不会用兜底值造一个假标签。
const tag = requireVersionTag();

const existing = execSync(`git tag --list "${tag}"`, { encoding: 'utf8' }).trim();
if (existing) {
  console.error(`标签 ${tag} 已存在。同一天要发第二个版本，请先改 package.json 的 version。`);
  process.exit(1);
}

execSync(`git tag "${tag}"`, { stdio: 'inherit' });

const head = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
console.log(`已创建标签 ${tag} → ${head}`);
console.log('推送标签：pnpm release');
console.log('');

// 按版本号倒序，最新发布的排在最上面
execSync('git tag --sort=-v:refname', { stdio: 'inherit' });
