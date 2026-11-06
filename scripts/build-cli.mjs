import { execSync } from 'child_process';
import { resolve, delimiter, join } from 'path';
import { mkdirSync } from 'fs';
import { computeCommitHash, readVersionTag } from './lib/version.mjs';

const rootDir = resolve(import.meta.dirname, '..');
const serverDir = join(rootDir, 'server');
const buildDir = join(rootDir, 'build');

// Ensure Go is on PATH — common install locations on Windows
const goPaths = [
  join(process.env.ProgramFiles || 'C:\\Program Files', 'Go', 'bin'),
  'C:\\Go\\bin',
];
const extraPaths = goPaths.filter(p => !process.env.PATH.split(delimiter).includes(p));
if (extraPaths.length) {
  process.env.PATH = extraPaths.join(delimiter) + delimiter + process.env.PATH;
}

// 版本号读自根目录 package.json，唯一来源；这里只读不写。
const version = readVersionTag();
const commitHash = computeCommitHash();

const ldflags = `-s -w -X 'main.version=${version}' -X 'main.commitHash=${commitHash}'`;

const outputName = process.platform === 'win32' ? 'lansend.exe' : 'lansend';
const outputPath = join(buildDir, outputName);

mkdirSync(buildDir, { recursive: true });

// 显式包路径 "./cmd/lansend"：禁止使用 ./...，否则会把 ./desktop 一起编（Linux 缺 GTK 会失败）
const cmd = `go build -ldflags="${ldflags}" -o "${outputPath}" ./cmd/lansend`;

console.log(`Building CLI with: CGO_ENABLED=0 ${cmd}`);
console.log(`  version    = ${version}`);
console.log(`  commitHash = ${commitHash}`);

execSync(cmd, {
  cwd: serverDir,
  env: { ...process.env, CGO_ENABLED: '0' },
  stdio: 'inherit',
});

console.log(`CLI build complete ✓ -> ${outputPath}`);
