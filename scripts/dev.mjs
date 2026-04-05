import { spawn } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = new Set();
let shuttingDown = false;
let exitCode = 0;

function terminateChildren(signal = 'SIGTERM') {
  for (const child of children) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
}

function shutdown(code = 0, signal = 'SIGTERM') {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  exitCode = code;
  terminateChildren(signal);
}

function spawnProcess(label, cwd, args) {
  const child = spawn(npmCommand, args, {
    cwd,
    stdio: 'inherit',
    env: process.env
  });

  children.add(child);

  child.on('exit', (code, signal) => {
    children.delete(child);

    if (!shuttingDown) {
      const normalizedCode = code ?? (signal ? 1 : 0);
      console.error(`[dev] ${label} 已退出，状态码: ${normalizedCode}`);
      shutdown(normalizedCode, signal ?? 'SIGTERM');
      return;
    }

    if (children.size === 0) {
      process.exit(exitCode);
    }
  });

  child.on('error', (error) => {
    console.error(`[dev] ${label} 启动失败`, error);
    shutdown(1);
  });

  return child;
}

spawnProcess('backend', 'welfare-backend', ['run', 'dev']);
spawnProcess('frontend', 'welfare-frontend', ['run', 'dev', '--', '--host', '0.0.0.0']);

process.on('SIGINT', () => shutdown(0, 'SIGINT'));
process.on('SIGTERM', () => shutdown(0, 'SIGTERM'));
