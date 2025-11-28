import fs from 'fs';
import path from 'path';
import * as utils from 'sauce-testrunner-utils';
import convert from 'xml-js';

const getPlatformName = (platform: string) => {
  if (process.platform.toLowerCase() === 'linux') {
    platform = 'Linux';
  }

  return platform;
};

export function generateJUnitFile(
  assetsPath: string,
  suiteName: string,
  browserName: string,
  platform: string,
) {
  const junitPath = path.join(assetsPath, `report.xml`);
  if (!fs.existsSync(junitPath)) {
    console.warn(
      `JUnit file generation skipped: the original JUnit file (${junitPath}) from TestCafe was not located.`,
    );
    return;
  }
  const opts = { compact: true, spaces: 4, textFn: (val: string) => val };
  const xmlData = fs.readFileSync(junitPath, 'utf8');
  const result: any = convert.xml2js(xmlData, opts);

  if (
    !result.testsuite ||
    !result.testsuite.testcase ||
    result.testsuite.testcase.length === 0
  ) {
    console.warn('JUnit file generation skipped: no test suites detected.');
    return;
  }

  const testsuites = result.testsuite;
  testsuites._attributes = testsuites._attributes || {};
  testsuites._attributes.id = 0;
  testsuites._attributes.name = suiteName;
  testsuites._attributes.timestamp = new Date(
    testsuites._attributes.timestamp,
  ).toISOString();
  for (let i = 0; i < testsuites.testcase.length; i++) {
    const testcase = testsuites.testcase[i];
    if (testcase.failure && testcase.failure._cdata) {
      testsuites.testcase[i].failure._attributes =
        testcase.failure._attributes || {};
      testsuites.testcase[i].failure._attributes.message = utils.escapeXML(
        testcase.failure._attributes.message || '',
      );
      testsuites.testcase[i].failure._attributes.type =
        testcase.failure._attributes.type || '';
      testsuites.testcase[i].failure._cdata = testcase.failure._cdata || '';
    }
  }
  testsuites.properties = {
    property: [
      {
        _attributes: {
          name: 'platformName',
          value: getPlatformName(platform),
        },
      },
      {
        _attributes: {
          name: 'browserName',
          value: browserName,
        },
      },
    ],
  };

  result.testsuites = {
    testsuite: testsuites,
  };
  delete result.testsuite;

  opts.textFn = utils.escapeXML;
  const xmlResult = convert.js2xml(result, opts);
  fs.writeFileSync(path.join(assetsPath, 'junit.xml'), xmlResult);
}
