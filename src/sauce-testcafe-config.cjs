const path = require('path');
const fs = require('fs');
const _ = require('lodash');

let userConfig = {};

const configFiles = process.env.TESTCAFE_CFG_FILE
  ? [process.env.TESTCAFE_CFG_FILE]
  : ['./.testcaferc.json', './.testcaferc.js', './.testcaferc.cjs'];

for (const file of configFiles) {
  if (fs.existsSync(file)) {
    try {
      const extname = path.extname(file);
      if (extname === '.json') {
        const content = fs.readFileSync(file);
        userConfig = JSON.parse(content.toString());
      }
      if (extname === '.js' || extname === '.cjs') {
        userConfig = require(file);
        if (userConfig.default) {
          userConfig = userConfig.default;
        }
      }
      break;
    } catch (e) {
      console.error(`failed to read TestCafe config file(${file}):`, e);
    }
  }
}

const overrides = {
  reporter: [
    {
      name: 'xunit',
      output: path.join(process.env.ASSETS_PATH || '__assets__', 'report.xml'),
    },
    {
      name: 'json',
      output: path.join(process.env.ASSETS_PATH || '__assets__', 'report.json'),
    },
    {
      name: 'saucelabs',
    },
    {
      name: 'list',
    },
  ],
};

// Values that are arrays are merged at the very end (see arrMerger()), but primitives are not.
// Allow the user to set a single reporter like so: `reporter: 'list'`.
if (userConfig.reporter && !(userConfig.reporter instanceof Array)) {
  overrides.reporter.push(userConfig.reporter);
}

function arrMerger(objValue, srcValue) {
  if (_.isArray(objValue)) {
    return objValue.concat(srcValue);
  }
}

const mergedConfig = _.mergeWith(userConfig, overrides, arrMerger);

// Remove video related options from the merged config.
// We'll handle them separately, because `_.mergeWith()` can't merge fields
// with `undefined` values.
mergedConfig.videoPath = undefined;
mergedConfig.videoOptions = undefined;
mergedConfig.videoEncodingOptions = undefined;

module.exports = mergedConfig;
