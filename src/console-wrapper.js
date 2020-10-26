#!/usr/bin/env node

const { HOME_DIR } = require('./constants');
const fs = require('fs');
const path = require('path');
const child_process = require('child_process');

(async () => {
    const fd = fs.createWriteStream(path.join(HOME_DIR, '/reports/testcafe.log'));
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