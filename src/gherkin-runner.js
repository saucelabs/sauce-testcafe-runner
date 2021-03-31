
const path = require('path');
const { getArgs } = require('sauce-testrunner-utils');
const createTestCafe = require('gherkin-testcafe');
const { run } = require('../lib/testcafe-runner');

if (require.main === module) {
  console.log(`Sauce TestCafe Gherkin Runner ${require(path.join(__dirname, '..', 'package.json')).version}`);
  const { runCfgPath, suiteName } = getArgs();

  run(runCfgPath, suiteName, createTestCafe)
      // eslint-disable-next-line promise/prefer-await-to-then
      .then((passed) => {
        process.exit(passed ? 0 : 1);
      })
      // eslint-disable-next-line promise/prefer-await-to-callbacks
      .catch((err) => {
        console.log(err);
        process.exit(1);
      });
}