import simpleGit from 'simple-git';
import { randomUUID } from 'node:crypto';
import { cfg } from './config.js';
import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import chalk from 'chalk';


export const git = simpleGit();


export async function createBranchName(prefix = cfg.branchPrefix) {
const id = randomUUID().slice(0, 8);
return `${prefix}${id}`;
}


export async function applyPatchWithGit(diff: string) {
writeFileSync('ai-fix.patch', diff, 'utf8');
try {
execSync('git apply --whitespace=fix ai-fix.patch', { stdio: 'inherit' });
} catch (err) {
console.error(chalk.red('git apply failed; trying 3-way merge...'));
execSync('git apply --3way ai-fix.patch', { stdio: 'inherit' });
}
}