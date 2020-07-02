const SauceLabs = require('saucelabs').default
const region = process.env.SAUCE_REGION || 'us-west-1'
const api = new SauceLabs({
  user: process.env.SAUCE_USERNAME,
  key: process.env.SAUCE_ACCESS_KEY,
  region: region
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
    total_tests: testsuite["attr"].tests,
    total_success: testsuite["attr"].errors === 0 ? true : false,
    total_failures: testsuite["attr"].errors,
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
      status: testFailed ? "failure" : "success",
      status_code: testFailed ? 0 : 1,
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

exports.sauceReporter = async (browserName, assets, results) => {
  let testName  = `devx testcafe ${(new Date().getTime())}`
  let status = results === 0;

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

  try {
    let browser = await remote({
      user: process.env.SAUCE_USERNAME,
      key: process.env.SAUCE_ACCESS_KEY,
      region: region,
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
  try {
    const { jobs } = await api.listJobs(
      process.env.SAUCE_USERNAME,
      { limit: 1, full: true, name: testName }
    )
    sessionId = jobs && jobs.length && jobs[0].id
  } catch (e) {
    console.warn("Failed to prepare test", e);
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
      uploadAssets
    ).then(
      () => console.log('upload successful'),
      (e) => console.log('upload failed:', e.stack)
    ),
    api.updateJob(process.env.SAUCE_USERNAME, sessionId, {
      name: testName,
      passed: results === 0 ? true : false
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
      domain = `${region}.saucelabs.com`
  }

  console.log(`\nOpen job details page: https://app.${domain}/tests/${sessionId}\n`);
}
