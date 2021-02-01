#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const stream = require('stream');
const child_process = require('child_process');
const { getArgs, loadRunConfig, getAbsolutePath } = require('./utils');

(async () => {
    const { runCfgPath } = getArgs();
    const runCfgAbsolutePath = getAbsolutePath(runCfgPath);
    const runCfg = await loadRunConfig(runCfgAbsolutePath);
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
        process.exit(exitCode);
    });
})();
