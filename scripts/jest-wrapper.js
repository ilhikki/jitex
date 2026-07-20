const { spawn, exec } = require('child_process');
const path = require('path');

const timeout = parseInt(process.env.TEST_TIMEOUT || '30000', 10);
const jestArgs = process.argv.slice(2);

console.log(`[jest-wrapper] Starting jest with timeout ${timeout}ms...`);
console.log(`[jest-wrapper] Args: ${jestArgs.join(' ')}`);

const jestProcess = spawn('npx', ['jest', ...jestArgs], {
  stdio: ['inherit', 'pipe', 'pipe'],
  cwd: path.resolve(__dirname, '..'),
  shell: true,
});

let stdout = '';
let stderr = '';

jestProcess.stdout.on('data', (data) => {
  stdout += data.toString();
  process.stdout.write(data);
});

jestProcess.stderr.on('data', (data) => {
  stderr += data.toString();
  process.stderr.write(data);
});

const timer = setTimeout(() => {
  console.error(`\n[jest-wrapper] TIMEOUT: Killing jest process after ${timeout}ms...`);
  try {
    if (process.platform === 'win32') {
      exec(`taskkill /F /T /PID ${jestProcess.pid}`);
    } else {
      exec(`kill -9 ${jestProcess.pid}`);
    }
  } catch (e) {
    console.error(`[jest-wrapper] Error killing process: ${e.message}`);
  }
  setTimeout(() => {
    process.exit(1);
  }, 2000);
}, timeout);

jestProcess.on('close', (code) => {
  clearTimeout(timer);
  console.log(`[jest-wrapper] Jest exited with code ${code}`);
  process.exit(code);
});

jestProcess.on('error', (err) => {
  clearTimeout(timer);
  console.error(`[jest-wrapper] Error: ${err.message}`);
  process.exit(1);
});
