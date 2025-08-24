// ai-fixer/src/index.ts
import { cfg } from './config.js';
import { parseStack } from './parser.js';
import { proposeUnifiedDiff } from './aiFixer.js';
import { git, createBranchName, applyPatchWithGit } from './git.js';
import { openPullRequest } from './github.js';
import { runTests } from './testsRunner.js';

import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import chalk from 'chalk';

/**
 * Pick relevant source files mentioned in the stacktrace.
 */
function pickFilesFromStack(stack: string) {
  const frames = parseStack(stack);
  const hits: { path: string; content: string }[] = [];

  const candidates = Array.from(new Set(frames.map(f => f.file)));
  for (const p of candidates) {
    const rel = p.startsWith('.') || p.startsWith('/')
      ? path.relative(process.cwd(), p)
      : p;

    // limit to common source types (tweak for your stack)
    if (!/\.(ts|tsx|js|jsx|java|cs|py)$/.test(rel)) continue;

    const full = path.join(process.cwd(), rel);
    if (existsSync(full)) {
      hits.push({
        path: rel,
        content: readFileSync(full, 'utf8'),
      });
    }
  }

  // add package.json for project context if available
  if (existsSync('package.json')) {
    hits.push({ path: 'package.json', content: readFileSync('package.json', 'utf8') });
  }

  // keep token usage under control
  return hits.slice(0, 10);
}

async function main() {
  const stack = process.env.STACKTRACE;
  const message = process.env.ERROR_MESSAGE ?? '';
  const service = process.env.ERROR_SERVICE ?? '';

  if (!stack) {
    console.error(chalk.red('No STACKTRACE provided.'));
    process.exit(1);
  }

  console.log(chalk.cyan('Parsing stack trace...'));
  const files = pickFilesFromStack(stack);

  if (files.length === 0) {
    console.error(chalk.red('No candidate files found from stacktrace.'));
    process.exit(1);
  }

  console.log(chalk.cyan(`Selected ${files.length} file(s) for AI context:`));
  for (const f of files) console.log('  -', f.path);

  console.log(chalk.cyan('Requesting AI-generated unified diff...'));
  const diff = await proposeUnifiedDiff({ message, stack, files });

  if (!diff || !diff.trim()) {
    console.error(chalk.red('AI did not return a patch.'));
    process.exit(1);
  }

  // Create working branch from default branch
  const branch = await createBranchName();
  console.log(chalk.cyan(`Creating branch ${branch} from ${cfg.defaultBranch}...`));
  await git.checkout(cfg.defaultBranch);
  await git.pull('origin', cfg.defaultBranch);
  await git.checkoutLocalBranch(branch);

  // Apply patch via git (uses whitespace-fix, falls back to 3-way in git.ts)
  console.log(chalk.cyan('Applying patch...'));
  try {
    await applyPatchWithGit(diff);
  } finally {
    // cleanup the temporary patch file if present
    try { unlinkSync('ai-fix.patch'); } catch {}
  }

  console.log(chalk.cyan('Running tests...'));
  const { passed, output } = runTests();
  if (!passed) {
    console.error(chalk.red('Tests failed after applying fix. Keeping branch for manual review.'));
    console.log(output);
    // Commit the changes anyway so reviewers can inspect them
    await git.add(['.']);
    await git.commit(`AI auto-fix (tests failed): ${message || 'production error'}${service ? ` [${service}]` : ''}`);
    await git.push('origin', branch);
    // Optionally open a PR even if tests fail — comment out if you prefer not to.
    const title = `AI Auto-fix (tests failing): ${message?.slice(0, 60) || 'Production error'}${message && message.length > 60 ? '…' : ''}`;
    const body = [
      'This PR was generated automatically by the AI Auto-Fixer.',
      '',
      `**Service:** ${service || 'N/A'}`,
      `**Message:** ${message || 'N/A'}`,
      '',
      '<details>',
      '<summary>Stack trace</summary>',
      '',
      '```',
      stack,
      '```',
      '',
      '</details>',
      '',
      '<details>',
      '<summary>Test output</summary>',
      '',
      '```',
      output || '(no output captured)',
      '```',
      '',
      '</details>'
    ].join('\n');
    const prUrl = await openPullRequest({ branch, title, body });
    console.log(chalk.yellow(`⚠️ Tests failing — PR opened for review: ${prUrl}`));
    process.exit(1);
  }

  console.log(chalk.green('✅ Tests passed. Committing and pushing branch...'));
  await git.add(['.']);
  await git.commit(`AI auto-fix: ${message || 'production error'}${service ? ` [${service}]` : ''}`);
  await git.push('origin', branch);

  console.log(chalk.cyan('Opening Pull Request...'));
  const title = `AI Auto-fix: ${message?.slice(0, 60) || 'Production error'}${message && message.length > 60 ? '…' : ''}`;
  const body = [
    'This PR was generated automatically by the AI Auto-Fixer.',
    '',
    `**Service:** ${service || 'N/A'}`,
    `**Message:** ${message || 'N/A'}`,
    '',
    '<details>',
    '<summary>Stack trace</summary>',
    '',
    '```',
    stack,
    '```',
    '',
    '</details>'
  ].join('\n');

  const prUrl = await openPullRequest({ branch, title, body });
  console.log(chalk.green(`✅ Pull Request created: ${prUrl}`));
}

main().catch(err => {
  console.error(chalk.red('Fatal error in fixer:'), err);
  process.exit(1);
});
