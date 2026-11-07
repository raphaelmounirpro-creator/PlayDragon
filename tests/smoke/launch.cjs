// Starts the smoke test (run.cjs) in Electron. Usage: npm run test:smoke (builds dist/ first).
const { spawn } = require('node:child_process');
const path = require('node:path');
const electron = require('electron'); // from Node, this is the path to the Electron binary

const env = { ...process.env };
// VS Code terminals may set it, and Electron would then start as plain Node.
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, [path.join(__dirname, 'run.cjs')], { env, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 1));
