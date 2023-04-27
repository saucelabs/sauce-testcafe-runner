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
