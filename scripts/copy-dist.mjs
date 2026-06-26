import { cpSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';

mkdirSync('server/embeddist/dist', { recursive: true });
for (const entry of readdirSync('dist')) {
  cpSync(join('dist', entry), join('server/embeddist/dist', entry), { recursive: true });
}