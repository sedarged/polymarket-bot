import { spawn } from 'node:child_process';

const mode = process.argv[2];

if (!mode || !['dev', 'start'].includes(mode)) {
  console.error('Usage: node scripts/run-stack.mjs <dev|start>');
  process.exit(1);
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const tasks =
  mode === 'dev'
    ? [
        ['run', 'dev:backend'],
        ['run', 'dev:frontend'],
      ]
    : [
        ['run', 'start:backend'],
        ['run', 'start:frontend'],
      ];

const children = tasks.map((args) =>
  spawn(npmCommand, args, {
    stdio: 'inherit',
    env: process.env,
  }),
);

function shutdown(code = 0): void {
  children.forEach((child) => {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  });
  process.exit(code);
}

children.forEach((child) => {
  child.on('exit', (code) => {
    if (code && code !== 0) {
      shutdown(code);
    }
  });
});

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
