import { spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export function command(args, { cwd = root, env = {} } = {}) {
  return new Promise((ok, fail) => {
    const child = spawn('pnpm', args, { cwd, env: { ...process.env, ...env }, stdio: 'inherit' });
    child.on('error', fail);
    child.on('exit', code => code === 0 ? ok() : fail(new Error(`pnpm ${args.join(' ')} exited ${code}`)));
  });
}
export async function startServer(framework, runtime, port, dev = false) {
  let output = '';
  const args = ['--dir', `examples/${framework}`, dev ? 'dev' : framework === 'modern' ? 'start' : 'preview'];
  const child = spawn('pnpm', args, {
    cwd: root,
    env: { ...process.env, RUNTIME: runtime, PORT: String(port), NODE_ENV: dev ? 'development' : 'production' },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  const stop = async () => {
    try { process.kill(-child.pid, 'SIGTERM'); } catch {}
    await Promise.race([new Promise(done => child.once('exit', done)), setTimeout(2000)]);
    try { process.kill(-child.pid, 'SIGKILL'); } catch {}
  };
  const url = `http://127.0.0.1:${port}`;
  try {
    for (let i = 0; i < 120; i++) {
      if (child.exitCode !== null) throw new Error(output);
      try { if ((await fetch(url)).ok) return { url, stop, logs: () => output }; } catch {}
      await setTimeout(500);
    }
    throw new Error(`Server did not start: ${output}`);
  } catch (error) { await stop(); throw error; }
}
