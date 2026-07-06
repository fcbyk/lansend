import { spawn } from 'child_process';
import { resolve } from 'path';

const binName = process.platform === 'win32' ? 'lansend.exe' : 'lansend';
const binPath = resolve(import.meta.dirname, '..', 'server', binName);

const args = process.argv.slice(2);
const child = spawn(binPath, args, { stdio: 'inherit' });

child.on('exit', (code) => process.exit(code ?? 0));
