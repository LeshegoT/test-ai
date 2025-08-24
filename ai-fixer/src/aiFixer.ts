import { GoogleGenerativeAI } from '@google/generative-ai';
import { cfg } from './config.js';

const SYSTEM_PROMPT = `You are an expert software engineer. You will receive a stack trace and relevant source files.

Output ONLY a valid unified diff (GNU patch format) with context lines, rooted at repository root. Do not include explanations. Use exact existing line endings. If a fix is unsafe, prefer adding checks and tests.`;

export type AIInputs = {
  stack: string;
  message?: string;
  files: { path: string; content: string }[];
};

export async function proposeUnifiedDiff(input: AIInputs): Promise<string> {
  const genAI = new GoogleGenerativeAI(cfg.geminiKey);
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-1.5-flash',
    generationConfig: {
      temperature: cfg.temperature || 0.1,
      maxOutputTokens: cfg.maxTokens || 4096,
    }
  });

  const userContent = [
    `ERROR MESSAGE:\n${input.message || ''}`,
    `STACK TRACE:\n${input.stack}`,
    `FILES:`,
    ...input.files.map(f => `---FILE ${f.path}---\n${f.content}`)
  ].join('\n\n');

  const prompt = `${SYSTEM_PROMPT}\n\n${userContent}`;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text().trim();

  // Basic sanity check: ensure it looks like a diff
  if (!/^diff --git /m.test(text) && !/^--- /m.test(text)) {
    throw new Error('Model did not return a unified diff.');
  }

  return text;
}