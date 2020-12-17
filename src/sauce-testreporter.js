const SauceLabs = require('saucelabs').default
const region = process.env.SAUCE_REGION || 'us-west-1'
const tld = region === 'staging' ? 'net' : 'com'
const api = new SauceLabs({
  user: process.env.SAUCE_USERNAME,
  key: process.env.SAUCE_ACCESS_KEY,
  region,
  tld
});

const { remote } = require('webdriverio');
const fs = require('fs');
const xml2js = require('xml2js');
const path = require('path')

const parser = new xml2js.Parser(
  {"attrkey": "attr"}
);

exports.createSauceJson = async (reportsFolder, xunitReport) => {
  let testCafeXML = fs.readFileSync(xunitReport);
  let result = await parser.parseStringPromise(testCafeXML);
  
  let testsuite = result.testsuite;

  const jsonLog = [];
  const nativeLog = {
    total_tests: parseInt(testsuite["attr"].tests),
    total_success: testsuite["attr"].tests - testsuite["attr"].errors,
    total_failures: parseInt(testsuite["attr"].errors),
    total_time: testsuite["attr"].time,
    tests: []
  }
  fixtures = {};
  let id = 0; 
  let in_video_timeline = 0;
  let lastFixture = "";
  for (let testcase of testsuite.testcase) {
    let testFailed = testcase["failure"] || false
    let fixture = testcase["attr"].classname;
    let test = {
      class: fixture,
      failure_reason: testFailed ? testcase["failure"][0] : null,
      name: testcase["attr"].name,
      status: testFailed ? "error" : "success",
      status_code: testFailed ? 1 : 0,
      test_time: testcase["attr"].time
    }
    nativeLog.tests.push(test);
    if (fixture !== lastFixture) {
      jsonLog.push({
        "status": "info",
        "message": `Fixture: ${fixture}`,
        "screenshot": null
      });
      lastFixture = fixture;
    }
    jsonLog.push({
      id: id++,
      "screenshot": 0,
      "HTTPStatus": test.status_code ? 200 : 500,
      "suggestion": null,
      "statusCode": test.status_code,
      "path": test.name,
      "between_commands": test.test_time,
      "result": {
        "status": test.status,
        "failure_reason": test.failure_reason
      },
      "request": {
        "skipped": testcase.skipped ? true : false
      },
      "suggestion": null,
      "in_video_timeline": in_video_timeline
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
}

// NOTE: this function is not available currently.
// It will be ready once data store API actually works.
// Keep these pieces of code for future integration.
const createJobShell = async (api, testName, browserName, tags) => {
  const body = {
    name: testName,
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
    tags: tags,
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
}

const createJobLegacy = async (api, region, tld, browserName, testName, tags, build) => {
  try {
    const hostname = `ondemand.${region}.saucelabs.${tld}`;
    await remote({
      user: process.env.SAUCE_USERNAME,
      key: process.env.SAUCE_ACCESS_KEY,
      region,
      tld,
      hostname,
      connectionRetryCount: 0,
      logLevel: 'silent',
      capabilities: {
          browserName: browserName,
          platformName: '*',
          browserVersion: '*',
          'sauce:options': {
              devX: true,
              name: testName,
              framework: 'testcafe',
              tags: tags,
              build
          }
      }
    }).catch((err) => err)
  } catch(e) { }

  return sessionId || 0;
}

// TODO Tian: this method is a temporary solution for creating jobs via test-composer.
// Once the global data store is ready, this method will be deprecated.
const createJobWorkaround = async (api, browserName, testName, tags, build, passed, startTime, endTime) => {
  const body = {
    name: testName,
    user: process.env.SAUCE_USERNAME,
    startTime,
    endTime,
    framework: 'testcafe',
    frameworkVersion: '*', // collect
    status: 'complete',
    errors: [],
    passed,
    tags,
    build,
    browserName,
    browserVersion: '*',
    platformName: '*' // in docker, no specified platform
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
}

exports.sauceReporter = async (browserName, assets, results, startTime, endTime) => {
// SAUCE_JOB_NAME is only available for saucectl >= 0.16, hence the fallback
  const testName = process.env.SAUCE_JOB_NAME || `DevX TestCafe Test Run - ${(new Date()).getTime()}`;

  let tags = process.env.SAUCE_TAGS
  if (tags) {
    tags = tags.split(",")
  }

  let build = process.env.SAUCE_BUILD_NAME

  /**
   * replace placeholders (e.g. $BUILD_ID) with environment values
   */
  const buildMatches = (build || '').match(/\$[a-zA-Z0-9_-]+/g) || []
  for (const match of buildMatches) {
    const replacement = process.env[match.slice(1)]
    build = build.replace(match, replacement || '')
  }

  let sessionId;
  if (process.env.ENABLE_DATA_STORE) {
    sessionId = await createJobShell(api, testName, browserName, tags)
  } else {
    sessionId = await createJobWorkaround(api, browserName, testName, tags, build, results === 0, startTime, endTime)
  }

  if (!sessionId) {
    console.error('Unable to retrieve test entry. Assets won\'t be uploaded.');
    return 'unable to retrieve test';
  }

  // create sauce asset
  console.log('Preparing assets');
  let [nativeLogJson, logJson] = await exports.createSauceJson(
    path.join(__dirname, '..', 'reports'),
    path.join(__dirname, '..', 'reports', 'report.xml')
  )
  let uploadAssets = [...assets, logJson, nativeLogJson];
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
      (e) => console.log('upload failed:', e.stack)
    ),
    api.updateJob(process.env.SAUCE_USERNAME, sessionId, {
      name: testName,
      passed: results === 0
    }).then(
      () => {},
      (e) => console.log('Failed to update job status', e)
    )
  ])

  let domain

  switch (region) {
    case "us-west-1":
      domain = "saucelabs.com"
      break
    default:
      domain = `${region}.saucelabs.${tld}`
  }

  console.log(`\nOpen job details page: https://app.${domain}/tests/${sessionId}\n`);
}
