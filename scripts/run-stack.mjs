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

let shuttingDown = false;
let pendingChildren = children.length;
let exitCode = 0;
const SHUTDOWN_TIMEOUT_MS = 10000;

function shutdown(code = 0): void {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  exitCode = code;

  children.forEach((child) => {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  });

  // Fallback: if children do not exit in time, forcefully exit.
  const timeout = setTimeout(() => {
    process.exit(exitCode);
  }, SHUTDOWN_TIMEOUT_MS);
  timeout.unref();
}

children.forEach((child) => {
  child.on('exit', (code) => {
    pendingChildren -= 1;

    if (!shuttingDown && code && code !== 0) {
      // Start coordinated shutdown on first non-zero exit code.
      shutdown(code);
      return;
    }

    if (pendingChildren <= 0) {
      // All children have exited; now exit the parent.
      process.exit(shuttingDown ? exitCode : 0);
    }
  });
});

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
