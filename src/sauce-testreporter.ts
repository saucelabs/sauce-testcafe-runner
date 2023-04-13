//const { updateExportedValue } = require('sauce-testrunner-utils').saucectl;
import fs from 'fs';
import path from 'path';
import * as utils from 'sauce-testrunner-utils';
//const { escapeXML } = require('sauce-testrunner-utils');
import convert from 'xml-js';
//const convert = require('xml-js');
//const {TestComposer} = require('@saucelabs/testcomposer');
import { TestComposer, Region, Asset } from '@saucelabs/testcomposer';

// Path has to match the value of the Dockerfile label com.saucelabs.job-info !
const SAUCECTL_OUTPUT_FILE = '/tmp/output.json';

const createJob = async (
  testComposer: any,
  browserName: string,
  suiteName: string,
  tags: string[],
  build: string,
  passed: boolean,
  startTime: string,
  endTime: string) => {

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

  let job;
  try {
    job = await testComposer.createReport({
      name: suiteName,
      startTime,
      endTime,
      framework: 'testcafe',
      frameworkVersion: process.env.TESTCAFE_VERSION,
      passed,
      tags,
      build,
      browserName,
      browserVersion,
      platformName: process.env.IMAGE_NAME + ':' + process.env.IMAGE_TAG
    });
  } catch (e) {
    console.error('Failed to create job:', e);
  }

  return job;
};

export async function sauceReporter (
  suiteName: string,
  browserName: string,
  assets: any[],
  results: number,
  startTime: string,
  endTime: string,
  region: string,
  metadata: any) {
  const tags = metadata.tags || [];
  const build = metadata.build || '';

  let pkgVersion = 'unknown';
  try {
    const pkgData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));
    pkgVersion = pkgData.version;
    // eslint-disable-next-line no-empty
  } catch (e) {
  }

  const testComposer = new TestComposer({
    region: region as Region,
    username: process.env.SAUCE_USERNAME || '',
    accessKey: process.env.SAUCE_ACCESS_KEY || '',
    headers: {'User-Agent': `testcafe-runner/${pkgVersion}`}
  });

  let job = await createJob(testComposer, browserName, suiteName, tags, build, results === 0, startTime, endTime);

  if (!job) {
    console.error('Unable to create job. Assets won\'t be uploaded.');
    utils.saucectl.updateExportedValue(SAUCECTL_OUTPUT_FILE, { reportingSucceeded: false });
    return false;
  }

  await testComposer.uploadAssets(
    job.id,
    assets as unknown as Asset[],
  ).then(
    (resp: any) => {
      if (resp.errors) {
        for (const err of resp.errors) {
          console.error('Failed to upload asset:', err);
        }
      }
    },
    (e: Error) => console.error('Failed to upload assets:', e.message)
  );

  console.log(`\nOpen job details page: ${job.url}\n`);

  utils.saucectl.updateExportedValue(SAUCECTL_OUTPUT_FILE, { jobDetailsUrl: job.url, reportingSucceeded: true });
  return true;
}

const getPlatformName = (platform: string) => {
  if (process.platform.toLowerCase() === 'linux') {
    platform = 'Linux';
  }

  return platform;
};

export function generateJunitFile (assetsPath: string, suiteName: string, browserName: string, platform: string) {
  const opts = {compact: true, spaces: 4, textFn: (val: string) => val};
  const xmlData = fs.readFileSync(path.join(assetsPath, `report.xml`), 'utf8');
  let result : any = convert.xml2js(xmlData, opts);

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
      testsuites.testcase[i].failure._attributes.message = utils.escapeXML(testcase.failure._attributes.message || '');
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

  opts.textFn = utils.escapeXML;
  let xmlResult = convert.js2xml(result, opts);
  fs.writeFileSync(path.join(assetsPath, 'junit.xml'), xmlResult);
}
