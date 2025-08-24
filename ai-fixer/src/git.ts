import simpleGit from 'simple-git';
import { randomUUID } from 'node:crypto';
import { cfg } from './config.js';
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname } from 'node:path';
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
    return;
  } catch {
    console.error(chalk.red('git apply failed; trying 3-way merge...'));
    try {
      execSync('git apply --3way ai-fix.patch', { stdio: 'inherit' });
      return;
    } catch {
      console.warn(chalk.yellow('3-way merge failed, falling back to manual patching...'));
    }
  }

  // --- Manual fallback ---
  const patch = readFileSync('ai-fix.patch', 'utf8');
  const touchedFiles: string[] = [];

  console.log(chalk.blue('Starting manual patch application...'));
  
  // Split patch into individual file sections
  const fileSections = patch.split(/^diff --git/m).filter(section => section.trim());
  
  // Handle the first section (might not start with "diff --git")
  if (!patch.startsWith('diff --git') && fileSections.length > 0) {
    fileSections[0] = 'diff --git' + fileSections[0];
  } else if (patch.startsWith('diff --git')) {
    // Re-add the "diff --git" prefix that was removed by split
    fileSections.forEach((section, index) => {
      if (index > 0) {
        fileSections[index] = 'diff --git' + section;
      }
    });
  }

  for (const section of fileSections) {
    if (!section.trim()) continue;

    // Extract file path from various possible headers
    let filePath: string | null = null;
    
    // Try different patterns to extract file path
    const patterns = [
      /^diff --git a\/(.+?) b\/\1/m,  // Standard git diff
      /^\+\+\+ b\/(.+)$/m,           // +++ header
      /^--- a\/(.+)$/m,              // --- header
      /^diff --git.*b\/(.+)$/m       // Alternative git diff format
    ];

    for (const pattern of patterns) {
      const match = section.match(pattern);
      if (match && match[1]) {
        filePath = match[1];
        break;
      }
    }

    if (!filePath) {
      console.warn(chalk.yellow('Could not extract file path from section:'), section.substring(0, 100));
      continue;
    }

    console.log(chalk.cyan(`Processing file: ${filePath}`));

    const fileExists = existsSync(filePath);

    if (!fileExists) {
      // Handle new file creation
      console.log(chalk.green(`Creating new file: ${filePath}`));
      const newFileContent = extractNewFileContent(section);
      if (newFileContent !== null) {
        mkdirSync(dirname(filePath), { recursive: true });
        writeFileSync(filePath, newFileContent, 'utf8');
        touchedFiles.push(filePath);
      }
    } else {
      // Handle modifications to existing file
      console.log(chalk.blue(`Modifying existing file: ${filePath}`));
      const success = applyHunksToFile(filePath, section);
      if (success) {
        touchedFiles.push(filePath);
      }
    }
  }

  if (touchedFiles.length === 0) {
    console.error(chalk.red('Patch content:'), patch);
    throw new Error('Fallback failed: no changes detected in patch');
  }

  console.log(chalk.green(`Successfully processed ${touchedFiles.length} file(s)`));

  // --- Auto-stage changed files ---
  try {
    await git.add(touchedFiles);
    console.log(chalk.blue(`Auto-staged ${touchedFiles.length} file(s) in Git`));
  } catch (err) {
    console.warn(chalk.red('Failed to auto-stage files:'), err);
  }
}

function extractNewFileContent(section: string): string | null {
  // For new files, extract all + lines
  const lines = section.split('\n');
  const contentLines: string[] = [];
  let inHunk = false;

  for (const line of lines) {
    if (line.startsWith('@@')) {
      inHunk = true;
      continue;
    }
    if (inHunk) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        contentLines.push(line.slice(1));
      } else if (line.startsWith(' ')) {
        contentLines.push(line.slice(1));
      }
    }
  }

  return contentLines.length > 0 ? contentLines.join('\n') : null;
}

function applyHunksToFile(filePath: string, section: string): boolean {
  try {
    let content = readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    // Extract all hunks from the section
    const hunkRegex = /@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@([\s\S]*?)(?=@@|$)/g;
    let match: RegExpExecArray | null;
    const hunks: Array<{
      oldStart: number;
      oldLines: number;
      newStart: number;
      newLines: number;
      changes: string[];
    }> = [];

    while ((match = hunkRegex.exec(section)) !== null) {
      const oldStart = parseInt(match[1]) - 1; // Convert to 0-based index
      const oldLines = parseInt(match[2] || '1');
      const newStart = parseInt(match[3]) - 1; // Convert to 0-based index
      const newLines = parseInt(match[4] || '1');
      const changes = match[5].split('\n').filter(line => line.length > 0 && !line.startsWith('\\'));
      
      hunks.push({ oldStart, oldLines, newStart, newLines, changes });
    }

    if (hunks.length === 0) {
      console.warn(chalk.yellow(`No hunks found in section for ${filePath}`));
      return false;
    }

    // Apply hunks in reverse order to avoid index shifting issues
    hunks.reverse().forEach((hunk, index) => {
      console.log(chalk.gray(`Applying hunk ${hunks.length - index} to ${filePath} at line ${hunk.oldStart + 1}`));
      applyHunkToLines(lines, hunk);
    });

    writeFileSync(filePath, lines.join('\n'), 'utf8');
    return true;
  } catch (error) {
    console.error(chalk.red(`Error applying hunks to ${filePath}:`), error);
    return false;
  }
}

function applyHunkToLines(lines: string[], hunk: any) {
  const { oldStart, changes } = hunk;
  let lineIndex = oldStart;
  let changeIndex = 0;

  const newLines: string[] = [];
  
  for (const change of changes) {
    if (!change || change.startsWith('\\')) continue;
    
    if (change.startsWith('-')) {
      // Remove line - skip it in the original
      lineIndex++;
    } else if (change.startsWith('+')) {
      // Add line
      newLines.push(change.slice(1));
    } else if (change.startsWith(' ')) {
      // Context line - add it and advance
      newLines.push(change.slice(1));
      lineIndex++;
    } else {
      // Treat as context if no prefix
      newLines.push(change);
      lineIndex++;
    }
  }

  // Replace the section with new lines
  lines.splice(oldStart, hunk.oldLines, ...newLines);
}