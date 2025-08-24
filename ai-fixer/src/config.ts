import 'dotenv/config';


export const cfg = {
geminiKey: process.env.GEMINI_API_KEY || '',
githubToken: process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '',
repoFullName: process.env.REPO_FULL_NAME || '',
defaultBranch: process.env.REPO_DEFAULT_BRANCH || 'main',
maxTokens: Number(process.env.AI_MAX_TOKENS || 4096),
temperature: Number(process.env.AI_TEMPERATURE || 0.1),
branchPrefix: process.env.BRANCH_PREFIX || 'ai/fix-',
runTests: (process.env.RUN_TESTS || 'true').toLowerCase() === 'true'
};


if (!cfg.geminiKey) throw new Error('GEMINI_API_KEY missing');
if (!cfg.githubToken) throw new Error('GITHUB_TOKEN missing');
if (!cfg.repoFullName) throw new Error('REPO_FULL_NAME missing');