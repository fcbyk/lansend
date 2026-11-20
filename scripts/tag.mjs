import { execSync } from 'child_process';
import { requireVersionTag } from './lib/version.mjs';

// 只做一件事：按当前 HEAD 的提交时间计算版本号，并在该 commit 上打标签。
//
// 不改文件、不提交 —— 版本号来自 commit 时间，本来就不需要任何手写字段。
// tag 只作为发布触发器；CI 会用同一个函数从 commit 时间重新计算并校验。
const tag = requireVersionTag();

const existing = execSync(`git tag --list "${tag}"`, { encoding: 'utf8' }).trim();
if (existing) {
  console.error(`标签 ${tag} 已存在。同一天只发一个版本；同日重发请先删除旧标签和 Release，再重新执行 pnpm tag。`);
  process.exit(1);
}

execSync(`git tag "${tag}"`, { stdio: 'inherit' });

const head = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
console.log(`已创建标签 ${tag} → ${head}`);
console.log('推送标签：pnpm release');
console.log('');

// 按版本号倒序，最新发布的排在最上面
execSync('git tag --sort=-v:refname', { stdio: 'inherit' });
