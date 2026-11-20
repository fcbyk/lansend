import { readVersionTag } from './lib/version.mjs';

// CI 与本地调试共用：打印当前 HEAD 对应的版本号（带 v 前缀）。
console.log(readVersionTag());
