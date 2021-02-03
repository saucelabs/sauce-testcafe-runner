#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const stream = require('stream');
const child_process = require('child_process');
const { getArgs, loadRunConfig, getAbsolutePath } = require('./utils');

async function testCafeRunner () {
    const { runCfgPath } = getArgs();
    const runCfgAbsolutePath = getAbsolutePath(runCfgPath);
    const runCfg = await loadRunConfig(runCfgAbsolutePath);
    const p = new Promise((resolve, reject) => {
        runCfg.path = runCfgPath;
        const assetsPath = path.join(path.dirname(runCfgAbsolutePath), runCfg.projectPath || '.', '__assets__');
        if (!fs.existsSync(assetsPath)) {
            fs.mkdirSync(assetsPath);
        }
        const fd = fs.openSync(path.join(assetsPath, 'console.log'), 'w+', 0o644);
        const ws = stream.Writable({
            write (data, encoding, cb) { fs.write(fd, data, undefined, encoding, cb) },
        });

        const [nodeBin] = process.argv;
        const testcafeRunnerEntry = path.join(__dirname, 'testcafe-runner.js');
        const child = child_process.spawn(nodeBin, [testcafeRunnerEntry, ...process.argv.slice(2)]);

        child.stdout.pipe(process.stdout);
        child.stderr.pipe(process.stderr);
        child.stdout.pipe(ws);
        child.stderr.pipe(ws);

        child.on('exit', (exitCode) => {
            fs.closeSync(fd);
            if (exitCode === 0) {
                resolve();
            } else {
                reject(exitCode);
            }
        });
    });
    return await p;
}

if (require.main === module) {
  const { runCfgPath, suiteName } = getArgs();

  consoleWrapper(runCfgPath, suiteName)
      // eslint-disable-next-line promise/prefer-await-to-then
      .then((passed) => process.exit(passed ? 0 : 1))
      // eslint-disable-next-line promise/prefer-await-to-callbacks
      .catch((err) => {
        console.log(err);
        process.exit(1);
      });
}

module.exports = { testCafeRunner };