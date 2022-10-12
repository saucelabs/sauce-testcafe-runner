const _ = require('lodash');
const fs = require('fs');
const path = require('path');
const { updateExportedValue } = require('sauce-testrunner-utils').saucectl;
const { escapeXML } = require('sauce-testrunner-utils');
const SauceLabs = require('saucelabs').default;
const convert = require('xml-js');

// Path has to match the value of the Dockerfile label com.saucelabs.job-info !
const SAUCECTL_OUTPUT_FILE = '/tmp/output.json';

const createJob = async (api, browserName, suiteName, tags, build, passed, startTime, endTime, saucectlVersion) => {
  let browserVersion;
  switch (browserName.toLowerCase()) {
    case 'firefox':
      browserVersion = process.env.FF_VER;
      break;
    case 'chrome':
      browserVersion = process.env.CHROME_VER;
      break;
    default:
      browserVersion = '*';
  }
  const body = {
    name: suiteName,
    user: process.env.SAUCE_USERNAME,
    startTime,
    endTime,
    framework: 'testcafe',
    frameworkVersion: process.env.TESTCAFE_VERSION,
    status: 'complete',
    suite: suiteName,
    errors: [],
    passed,
    tags,
    build,
    browserName,
    browserVersion,
    platformName: process.env.IMAGE_NAME + ':' + process.env.IMAGE_TAG,
    saucectlVersion,
  };

  let sessionId;
  await api.createJob(
    body
  ).then(
    (resp) => {
      sessionId = resp.ID;
    },
    (e) => console.error('Create job failed: ', e.stack)
  );

  return sessionId || 0;
};

exports.sauceReporter = async ({suiteName, browserName, assets, assetsPath, results, startTime, endTime, metrics, region, metadata, saucectlVersion}) => {
  const tags = metadata.tags || [];
  const build = metadata.build || '';

  const tld = region === 'staging' ? 'net' : 'com';
  const api = new SauceLabs({
    user: process.env.SAUCE_USERNAME,
    key: process.env.SAUCE_ACCESS_KEY,
    region,
    tld
  });

  let sessionId = await createJob(api, browserName, suiteName, tags, build, results === 0, startTime, endTime, saucectlVersion);

  if (!sessionId) {
    console.error('Unable to retrieve test entry. Assets won\'t be uploaded.');
    updateExportedValue(SAUCECTL_OUTPUT_FILE, { reportingSucceeded: false });
    return false;
  }

  // create sauce asset
  console.log('Preparing assets');

  // Upload metrics
  let mtFiles = [];
  for (let [, mt] of Object.entries(metrics)) {
    if (_.isEmpty(mt.data)) {
      continue;
    }
    let mtFile = path.join(assetsPath, mt.name);
    fs.writeFileSync(mtFile, JSON.stringify(mt.data, ' ', 2));
    mtFiles.push(mtFile);
  }

  let junitPath = path.join(assetsPath, 'junit.xml');
  if (fs.existsSync(junitPath)) {
    assets.push(junitPath);
  }

  let sauceTestReport = path.join(assetsPath, 'sauce-test-report.json');
  if (fs.existsSync(sauceTestReport)) {
    assets.push(sauceTestReport);
  }

  let uploadAssets = [...assets, ...mtFiles];
  // upload assets
  await Promise.all([
    api.uploadJobAssets(
      sessionId,
      { files: uploadAssets }
    ).then(
      (resp) => {
        if (resp.errors) {
          for (let err of resp.errors) {
            console.error(err);
          }
        }
      },
      (e) => {
        console.log('upload failed:', e.stack);
        updateExportedValue(SAUCECTL_OUTPUT_FILE, { reportingSucceeded: false });
      }
    ),
    api.updateJob(process.env.SAUCE_USERNAME, sessionId, {
      name: suiteName,
      passed: results === 0
    }).then(
      () => {},
      (e) => {
        console.log('Failed to update job status', e);
        updateExportedValue(SAUCECTL_OUTPUT_FILE, { reportingSucceeded: false });
      }
    )
  ]);

  let domain;

  switch (region) {
    case 'us-west-1':
      domain = 'saucelabs.com';
      break;
    default:
      domain = `${region}.saucelabs.${tld}`;
  }

  const jobDetailsUrl = `https://app.${domain}/tests/${sessionId}`;
  console.log(`\nOpen job details page: ${jobDetailsUrl}\n`);

  updateExportedValue(SAUCECTL_OUTPUT_FILE, { jobDetailsUrl, reportingSucceeded: true });
  return true;
};

const getPlatformName = (platform) => {
  if (process.platform.toLowerCase() === 'linux') {
    platform = 'Linux';
  }

  return platform;
};

exports.generateJunitFile = (assetsPath, suiteName, browserName, platform) => {
  const opts = {compact: true, spaces: 4};
  const xmlData = fs.readFileSync(path.join(assetsPath, `report.xml`), 'utf8');
  let result = convert.xml2js(xmlData, opts);

  if (!result.testsuite) {
    return;
  }

  let testsuites = result.testsuite;
  testsuites._attributes = testsuites._attributes || {};
  testsuites._attributes.id = 0;
  testsuites._attributes.name = suiteName;
  testsuites._attributes.timestamp = (new Date(testsuites._attributes.timestamp)).toISOString();
  for (let i = 0; i < testsuites.testcase.length; i++) {
    const testcase = testsuites.testcase[i];
    if (testcase.failure && testcase.failure._cdata) {
      testsuites.testcase[i].failure._attributes = testcase.failure._attributes || {};
      testsuites.testcase[i].failure._attributes.message = escapeXML(testcase.failure._attributes.message || '');
      testsuites.testcase[i].failure._attributes.type = testcase.failure._attributes.type || '';
      testsuites.testcase[i].failure._cdata = testcase.failure._cdata || '';
    }
  }
  testsuites.properties = {
    property: [
      {
        _attributes: {
          name: 'platformName',
          value: getPlatformName(platform),
        }
      },
      {
        _attributes: {
          name: 'browserName',
          value: browserName,
        }
      }
    ]
  };

  result.testsuites = {
    testsuite: testsuites
  };
  delete result.testsuite;

  opts.textFn = escapeXML;
  let xmlResult = convert.js2xml(result, opts);
  fs.writeFileSync(path.join(assetsPath, 'junit.xml'), xmlResult);
};
