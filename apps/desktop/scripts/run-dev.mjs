import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.ELECTRON_RENDERER_URL;

const isWindows = process.platform === 'win32';
const executable = isWindows ? 'electron-vite.cmd' : 'electron-vite';
const command = isWindows ? `${executable} dev` : executable;
const args = isWindows ? [] : ['dev'];

async function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer();

    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

async function findAvailablePort(startPort) {
  for (let port = startPort; port < startPort + 50; port += 1) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }

  throw new Error(`No available renderer port found from ${startPort}`);
}

env.LUMI_RENDERER_PORT ??= String(await findAvailablePort(5175));

const child = spawn(command, args, {
  env,
  shell: isWindows,
  stdio: 'inherit'
});

child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  if (code === 0 || signal) {
    return;
  }

  console.error(`${executable} exited with code ${code}`);
  process.exitCode = code ?? 1;
});
