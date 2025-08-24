export type StackFrame = { file: string; line?: number; column?: number };


export function parseStack(stack: string): StackFrame[] {
const lines = stack.split(/\r?\n/);
const frames: StackFrame[] = [];
for (const l of lines) {
// patterns like: at fn (src/path/file.ts:123:45)
const m1 = l.match(/\(([^\)]+):(\d+):(\d+)\)/);
if (m1) {
frames.push({ file: m1[1], line: Number(m1[2]), column: Number(m1[3]) });
continue;
}
// patterns like: src/path/file.ts:123:45
const m2 = l.match(/\s(\/?.+\.(?:ts|tsx|js|jsx|java|cs|py)):(\d+)(?::(\d+))?/);
if (m2) {
frames.push({ file: m2[1], line: Number(m2[2]), column: m2[3] ? Number(m2[3]) : undefined });
continue;
}
}
// Deduplicate preserving order
const seen = new Set<string>();
return frames.filter(f => {
const key = `${f.file}:${f.line}:${f.column}`;
if (seen.has(key)) return false;
seen.add(key);
return true;
});
}