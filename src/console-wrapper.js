#!/usr/bin/env node

const { HOME_DIR } = require('./constants');
const fs = require('fs');
const path = require('path');
const stream = require('stream');
const child_process = require('child_process');

(async () => {
    const fd = fs.openSync(path.join(HOME_DIR, '/reports/testcafe.log'), 'w+', 0644);
    const ws = stream.Writable({
        write: (data, encoding, cb) => fs.write(fd, data, undefined, encoding, cb),
    })

    child = child_process.spawn('node', [path.join(HOME_DIR, './src/testcafe-runner.js')]);

    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);
    child.stdout.pipe(ws);
    child.stderr.pipe(ws);

    child.on('exit', () => fs.closeSync(fd));
})();
