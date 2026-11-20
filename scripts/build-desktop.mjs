import { execSync } from 'child_process';
import { resolve, delimiter, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { computeCommitHash, readVersionTag } from './lib/version.mjs';

const rootDir = resolve(import.meta.dirname, '..');
const serverDir = join(rootDir, 'server');
const buildDir = join(rootDir, 'build');
const assetDir = join(serverDir, 'desktop', 'frontend', 'dist');
// 桌面端不只是自己的窗口：它还要跑 core 服务，把局域网网页发给别的设备。
// 那份页面由 internal/spa → embeddist 用 //go:embed 打进同一个二进制，
// 所以两个前端产物缺一不可。
const webAssetDir = join(serverDir, 'embeddist', 'dist');

// 前端产物是 //go:embed 的输入，缺了就会在编译期报错。
// 这里提前拦住并给出可执行的提示，比让 go 报 "no matching files" 清楚。
if (!existsSync(join(assetDir, 'index.html'))) {
  console.error(`缺少桌面端前端产物：${assetDir}`);
  console.error('请先运行 pnpm build:web:desktop');
  process.exit(1);
}

if (!existsSync(join(webAssetDir, 'index.html'))) {
  console.error(`缺少局域网网页产物：${webAssetDir}`);
  console.error('桌面端会内嵌这份页面（embeddist 通过 //go:embed 引入），请先运行 pnpm build:web');
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
const isMacOS = process.platform === 'darwin';

// 桌面端只支持较新的 macOS，老旧系统用 CLI。
// 这个版本号必须在三处一致，否则 cgo 对象和最终链接产物的最低版本会对不上：
// clang 的 -mmacosx-version-min、Go 传给外链器的参数、Info.plist。
// build-mac-desktop.sh 里的默认值与这里保持同步。
const macOSMinVersion = process.env.MACOSX_DEPLOYMENT_TARGET || '11.0';
const macOSMinFlag = `-mmacosx-version-min=${macOSMinVersion}`;

// 与 CLI 同源：版本号来自当前 HEAD 的提交时间，哈希取当前提交。
// 时间语义的版本同一天内不变化，只有哈希能区分是当天的哪一次构建，
// 所以两者必须一起注入、一起展示。
const version = readVersionTag();
const commitHash = computeCommitHash();

// Windows 桌面端必须走 GUI 子系统，否则会附带一个黑色控制台窗口
const ldflags = [
  isWindows ? '-H windowsgui' : '',
  `-X 'main.version=${version}'`,
  `-X 'main.commitHash=${commitHash}'`,
  isMacOS ? `-extldflags '${macOSMinFlag}'` : '',
]
  .filter(Boolean)
  .join(' ');

const outputName = isWindows ? 'lansend-desktop.exe' : 'lansend-desktop';
const outputPath = join(buildDir, outputName);

mkdirSync(buildDir, { recursive: true });

// Windows 的 exe 图标与「属性 → 详细信息」里的版本都来自同一个 syso（链接器只接受
// 一个 .rsrc 段），而版本号每天都变，所以这两个 syso 不进仓库，构建前现生成。
// -skip-assets 保住已提交的 icon.ico / icon.icns，不让它们每天跟着变。
if (isWindows) {
  const resDir = join(serverDir, 'tools', 'iconres');
  const resCmd = `go run . -version "${version}" -commit "${commitHash}" -skip-assets`;

  console.log(`Generating Windows resources: ${resCmd}`);

  execSync(resCmd, { cwd: resDir, env: process.env, stdio: 'inherit' });
}

// 显式包路径 "./desktop"：禁止使用 ./...，理由同 build-cli.mjs
const cmd = `go build -ldflags="${ldflags}" -o "${outputPath}" ./desktop`;

// wails v3 在 Windows 上通过 purego 调用 Win32，无需 cgo；
// macOS (Cocoa) 与 Linux (GTK/webkit2gtk) 需要 cgo。
const env = { ...process.env };
if (!isWindows) {
  env.CGO_ENABLED = '1';
}
// 只设 MACOSX_DEPLOYMENT_TARGET 不够：部分 cgo 包没有写最低版本，
// clang 仍会按宿主系统版本编译对象。这里把 min 版本显式追加到 cgo
// 编译与链接参数末尾（后写覆盖先写），再用 extldflags 对齐最终链接。
if (isMacOS) {
  env.MACOSX_DEPLOYMENT_TARGET = macOSMinVersion;
  env.CGO_CFLAGS = [env.CGO_CFLAGS, macOSMinFlag].filter(Boolean).join(' ');
  env.CGO_LDFLAGS = [env.CGO_LDFLAGS, macOSMinFlag].filter(Boolean).join(' ');
}

console.log(`Building desktop ${isWindows ? 'with: ' : 'with: CGO_ENABLED=1 '}${cmd}`);
console.log(`  version    = ${version}`);
console.log(`  commitHash = ${commitHash}`);

execSync(cmd, { cwd: serverDir, env, stdio: 'inherit' });

// macOS 的 .app 打包由 scripts/build-mac-desktop.sh 完成
console.log(`Desktop build complete ✓ -> ${outputPath}`);
