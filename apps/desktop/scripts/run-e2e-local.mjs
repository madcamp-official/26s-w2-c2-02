import { spawn } from 'node:child_process';

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const isWindows = process.platform === 'win32';

function run(command, args) {
  return new Promise((resolve, reject) => {
    const executable = isWindows ? `${command}.cmd` : command;
    const options = { env, stdio: 'inherit' };
    const child = isWindows
      ? spawn([executable, ...args].join(' '), { ...options, shell: true })
      : spawn(executable, args, options);

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          signal
            ? `${executable} exited with signal ${signal}`
            : `${executable} exited with code ${code}`
        )
      );
    });
  });
}

try {
  await run('electron-vite', ['build']);
  await run('playwright', ['test', '-c', 'playwright.e2e.config.ts']);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
