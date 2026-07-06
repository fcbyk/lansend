import { execSync } from 'child_process';

// Generate version tag: vYYYY.M.D (strip leading zeros)
const now = new Date();
const year = now.getFullYear();
const month = now.getMonth() + 1;
const day = now.getDate();
const version = `v${year}.${month}.${day}`;

execSync(`git tag "${version}"`, { stdio: 'inherit' });
execSync('git tag', { stdio: 'inherit' });
