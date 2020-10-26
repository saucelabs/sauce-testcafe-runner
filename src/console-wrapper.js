#!/usr/bin/env node

const fs = require('fs');
const child_process = require('child_process');

(async () => {
    const fd = fs.createWriteStream('./testcafe.log');
    child = child_process.spawn('node', ['./src/testcafe-runner.js']);

    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);
    child.stdout.pipe(fd);
    child.stderr.pipe(fd);

    await new Promise((acc) => {
        fd.close();
        child.on('exit', () => acc());
    });
})();