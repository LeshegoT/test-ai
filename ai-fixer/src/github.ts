import { Octokit } from '@octokit/rest';
import { cfg } from './config.js';


export async function openPullRequest(params: {
branch: string;
title: string;
body: string;
}): Promise<string> {
const [owner, repo] = cfg.repoFullName.split('/');
const octo = new Octokit({ auth: cfg.githubToken });


const pr = await octo.pulls.create({
owner,
repo,
title: params.title,
head: params.branch,
base: cfg.defaultBranch,
body: params.body
});
return pr.data.html_url;
}