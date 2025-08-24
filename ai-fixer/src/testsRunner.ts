import { execSync } from 'node:child_process';


export function runTests(): { passed: boolean; output: string } {
try {
const out = execSync('npm test --silent', { stdio: 'pipe', encoding: 'utf8' });
return { passed: true, output: out };
} catch (e: any) {
const out = (e.stdout || e.message || '').toString();
return { passed: false, output: out };
}

}