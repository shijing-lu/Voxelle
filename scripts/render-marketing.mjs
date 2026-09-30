import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
const bundled = path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
const python = process.env.VOXELLE_PYTHON || (existsSync(bundled) ? bundled : 'python');
const result = spawnSync(python, ['marketing/render.py', ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(result.status ?? 1);
