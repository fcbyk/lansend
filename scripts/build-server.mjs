import { execSync } from 'child_process';
import { resolve, delimiter, join } from 'path';

const serverDir = resolve(import.meta.dirname, '..', 'server');

// Ensure Go is on PATH — common install locations on Windows
const goPaths = [
  join(process.env.ProgramFiles || 'C:\\Program Files', 'Go', 'bin'),
  'C:\\Go\\bin',
];
const extraPaths = goPaths.filter(p => !process.env.PATH.split(delimiter).includes(p));
if (extraPaths.length) {
  process.env.PATH = extraPaths.join(delimiter) + delimiter + process.env.PATH;
}

// Compute version string: vYYYY.MM.DD (strip leading zeros from month/day)
const now = new Date();
const year = now.getFullYear();
const month = now.getMonth() + 1; // 0-indexed
const day = now.getDate();
const version = `v${year}.${month}.${day}`;

// Compute short commit hash
let commitHash = 'unknown';
try {
  commitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
} catch {
  console.warn('Warning: could not get git commit hash');
}

const ldflags = `-s -w -X 'main.version=${version}' -X 'main.commitHash=${commitHash}'`;

const outputName = process.platform === 'win32' ? 'lansend.exe' : 'lansend';

const cmd = `go build -ldflags="${ldflags}" -o ${outputName} .`;

console.log(`Building server with: CGO_ENABLED=1 ${cmd}`);
console.log(`  version    = ${version}`);
console.log(`  commitHash = ${commitHash}`);

execSync(cmd, {
  cwd: serverDir,
  env: { ...process.env, CGO_ENABLED: '1' },
  stdio: 'inherit',
});

console.log('Server build complete ✓');
