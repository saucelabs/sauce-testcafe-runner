#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import child_process from 'child_process';
import * as utils from 'sauce-testrunner-utils';
import { TestCafeConfig } from './type';

async function testCafeRunner() {
  const { runCfgPath } = utils.getArgs();
  const runCfgAbsolutePath = utils.getAbsolutePath(runCfgPath);
  const runCfg = await utils.loadRunConfig(runCfgAbsolutePath);
  const p = new Promise<void>((resolve, reject) => {
    (runCfg as TestCafeConfig).path = runCfgPath;
    const assetsPath = path.join(
      path.dirname(runCfgAbsolutePath),
      (runCfg as TestCafeConfig).projectPath || '.',
      '__assets__',
    );
    if (!fs.existsSync(assetsPath)) {
      fs.mkdirSync(assetsPath);
    }

    const [nodeBin] = process.argv;
    const testcafeRunnerEntry = path.join(__dirname, 'testcafe-runner.js');
    const child = child_process.spawn(nodeBin, [
      testcafeRunnerEntry,
      ...process.argv.slice(2),
    ]);

    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);

    child.on('exit', (exitCode: number) => {
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
  testCafeRunner()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(err);
    });
}

module.exports = { testCafeRunner };
