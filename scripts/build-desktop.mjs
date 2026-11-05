import { execSync } from 'child_process';
import { resolve, delimiter, join } from 'path';
import { existsSync, mkdirSync } from 'fs';

const rootDir = resolve(import.meta.dirname, '..');
const serverDir = join(rootDir, 'server');
const buildDir = join(rootDir, 'build');
const assetDir = join(serverDir, 'desktop', 'frontend', 'dist');

// 前端产物是 //go:embed 的输入，缺了就会在编译期报错。
// 这里提前拦住并给出可执行的提示，比让 go 报 "no matching files" 清楚。
if (!existsSync(join(assetDir, 'index.html'))) {
  console.error(`缺少桌面端前端产物：${assetDir}`);
  console.error('请先运行 pnpm build:web:desktop');
  process.exit(1);
}

// Ensure Go is on PATH — common install locations on Windows
const goPaths = [
  join(process.env.ProgramFiles || 'C:\\Program Files', 'Go', 'bin'),
  'C:\\Go\\bin',
];
const extraPaths = goPaths.filter(p => !process.env.PATH.split(delimiter).includes(p));
if (extraPaths.length) {
  process.env.PATH = extraPaths.join(delimiter) + delimiter + process.env.PATH;
}

const isWindows = process.platform === 'win32';

// Windows 桌面端必须走 GUI 子系统，否则会附带一个黑色控制台窗口
const ldflags = isWindows ? `-H windowsgui` : '';

const outputName = isWindows ? 'lansend-desktop.exe' : 'lansend-desktop';
const outputPath = join(buildDir, outputName);

mkdirSync(buildDir, { recursive: true });

// 显式包路径 "./desktop"：禁止使用 ./...，理由同 build-cli.mjs
const cmd = ldflags
  ? `go build -ldflags="${ldflags}" -o "${outputPath}" ./desktop`
  : `go build -o "${outputPath}" ./desktop`;

// wails v3 在 Windows 上通过 purego 调用 Win32，无需 cgo；
// macOS (Cocoa) 与 Linux (GTK/webkit2gtk) 需要 cgo。
const env = { ...process.env };
if (!isWindows) {
  env.CGO_ENABLED = '1';
}

console.log(`Building desktop ${isWindows ? 'with: ' : 'with: CGO_ENABLED=1 '}${cmd}`);

execSync(cmd, { cwd: serverDir, env, stdio: 'inherit' });

// macOS 的 .app 打包由 scripts/build-mac-desktop.sh 完成
console.log(`Desktop build complete ✓ -> ${outputPath}`);
