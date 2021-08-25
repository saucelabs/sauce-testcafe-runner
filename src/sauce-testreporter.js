const _ = require('lodash');
const fs = require('fs');
const xml2js = require('xml2js');
const path = require('path');
const { updateExportedValue } = require('sauce-testrunner-utils').saucectl;
const { escapeXML } = require('sauce-testrunner-utils');
const SauceLabs = require('saucelabs').default;
const convert = require('xml-js');

// Path has to match the value of the Dockerfile label com.saucelabs.job-info !
const SAUCECTL_OUTPUT_FILE = '/tmp/output.json';

const parser = new xml2js.Parser(
  {'attrkey': 'attr'}
);

exports.createSauceJson = async (reportsFolder, xunitReport) => {
  let testCafeXML = fs.readFileSync(xunitReport);
  let result = await parser.parseStringPromise(testCafeXML);

  if (result === null) {
    return [];
  }
  let testsuite = result.testsuite;

  const jsonLog = [];
  const nativeLog = {
    total_tests: parseInt(testsuite.attr.tests, 10),
    total_success: testsuite.attr.tests - testsuite.attr.errors,
    total_failures: parseInt(testsuite.attr.errors, 10),
    total_time: testsuite.attr.time,
    tests: []
  };
  let id = 0;
  let in_video_timeline = 0;
  let lastFixture = '';
  for (let testcase of testsuite.testcase) {
    let testFailed = testcase.failure || false;
    let fixture = testcase.attr.classname;
    let test = {
      class: fixture,
      failure_reason: testFailed ? testcase.failure[0] : null,
      name: testcase.attr.name,
      status: testFailed ? 'error' : 'success',
      status_code: testFailed ? 1 : 0,
      test_time: testcase.attr.time
    };
    nativeLog.tests.push(test);
    if (fixture !== lastFixture) {
      jsonLog.push({
        'status': 'info',
        'message': `Fixture: ${fixture}`,
        'screenshot': null
      });
      lastFixture = fixture;
    }
    jsonLog.push({
      id: id++,
      'screenshot': 0,
      'HTTPStatus': test.status_code ? 200 : 500,
      'suggestion': null,
      'statusCode': test.status_code,
      'path': test.name,
      'between_commands': test.test_time,
      'result': {
        'status': test.status,
        'failure_reason': test.failure_reason
      },
      'request': {
        'skipped': testcase.skipped ? true : false
      },
      in_video_timeline
    });
    in_video_timeline += parseFloat(test.test_time);
  }
  const nativeLogFile = path.join('reports', 'native-log.json');
  fs.writeFileSync(
    nativeLogFile,
    JSON.stringify(nativeLog, '', 2)
  );
  const jsonLogFile = path.join('reports', 'log.json');
  fs.writeFileSync(
    jsonLogFile,
    JSON.stringify(jsonLog, '', 2)
  );
  return [nativeLogFile, jsonLogFile];
};

// NOTE: this function is not available currently.
// It will be ready once data store API actually works.
// Keep these pieces of code for future integration.
const createJobShell = async (api, suiteName, browserName, tags) => {
  const body = {
    name: suiteName,
    acl: [
      {
        type: 'username',
        value: process.env.SAUCE_USERNAME
      }
    ],
    //'start_time: startTime,
    //'end_time: endTime,
    source: 'vdc', // will use devx
    platform: 'webdriver', // will use testcafe
    status: 'complete',
    live: false,
    metadata: {},
    tags,
    attributes: {
      container: false,
      browser: browserName,
      browser_version: '*',
      commands_not_successful: 1, // to be removed
      devx: true,
      os: 'test', // need collect
      performance_enabled: 'true', // to be removed
      public: 'team',
      record_logs: true, // to be removed
      record_mp4: 'true', // to be removed
      record_screenshots: 'true', // to be removed
      record_video: 'true', // to be removed
      video_url: 'test', // remove
      log_url: 'test' // remove
    }
  };

  let sessionId;
  await Promise.all([
    api.createResultJob(
      body
    ).then(
      (resp) => {
        sessionId = resp.id;
      },
      (e) => console.error('Create job failed: ', e.stack)
    )
  ]);

  return sessionId || 0;
};

// TODO Tian: this method is a temporary solution for creating jobs via test-composer.
// Once the global data store is ready, this method will be deprecated.
const createJobWorkaround = async (api, browserName, suiteName, tags, build, passed, startTime, endTime, saucectlVersion) => {
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

  let sessionId;
  if (process.env.ENABLE_DATA_STORE) {
    sessionId = await createJobShell(api, suiteName, browserName, tags);
  } else {
    sessionId = await createJobWorkaround(api, browserName, suiteName, tags, build, results === 0, startTime, endTime, saucectlVersion);
  }

  if (!sessionId) {
    console.error('Unable to retrieve test entry. Assets won\'t be uploaded.');
    updateExportedValue(SAUCECTL_OUTPUT_FILE, { reportingSucceeded: false });
    return false;
  }

  // create sauce asset
  console.log('Preparing assets');
  let [nativeLogJson, logJson] = await exports.createSauceJson(
    path.join(assetsPath, 'reports'),
    path.join(assetsPath, 'report.xml')
  );

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

  let uploadAssets = [...assets, ...mtFiles];
  if (nativeLogJson !== undefined) {
    uploadAssets.push(nativeLogJson);
  }
  if (logJson !== undefined) {
    uploadAssets.push(logJson);
  }
  // updaload assets
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

exports.generateJunitFile = (assetsPath, suiteName, browserName, platform) => {
  let result;
  const opts = {compact: true, spaces: 4};
  try {
    const xmlData = fs.readFileSync(path.join(assetsPath, `report.xml`), 'utf8');
    result = convert.xml2js(xmlData, opts);
  } catch (err) {
    console.error(err);
  }
  result.testsuite._attributes.id = 0;
  result.testsuite._attributes.name = suiteName;
  result.testsuite._attributes.timestamp = (new Date(result.testsuite._attributes.timestamp)).toISOString();
  for (let i = 0; i < result.testsuite.testcase.length; i++) {
    const testcase = result.testsuite.testcase[i];
    if (testcase.failure && testcase.failure._cdata) {
      result.testsuite.testcase[i].failure._attributes = testcase.failure._attributes || {};
      result.testsuite.testcase[i].failure._attributes.message = escapeXML(testcase.failure._attributes.message || '');
      result.testsuite.testcase[i].failure._attributes.type = testcase.failure._attributes.type || '';
      result.testsuite.testcase[i].failure._cdata = testcase.failure._cdata || '';
    }
  }
  result.testsuite.properties = {};
  if (process.platform.toLowerCase() === 'linux') {
    platform = 'Linux';
  }
  result.testsuite.properties.property = [
    {
      _attributes: {
        name: 'platformName',
        value: platform,
      }
    },
    {
      _attributes: {
        name: 'browserName',
        value: browserName,
      }
    }
  ];
  result.testsuites = {};
  result.testsuites.testsuite = result.testsuite;
  delete result.testsuite;

  try {
    opts.textFn = escapeXML;

    let xmlResult = convert.js2xml(result, opts);
    fs.writeFileSync(path.join(assetsPath, 'junit.xml'), xmlResult);
  } catch (err) {
    console.error(err);
  }
};
