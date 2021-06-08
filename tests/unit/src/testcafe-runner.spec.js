jest.mock('testcafe');
jest.mock('sauce-testrunner-utils');
jest.mock('../../../src/sauce-testreporter');
const { run } = require('../../../src/testcafe-runner');
const utils = require('sauce-testrunner-utils');
const { sauceReporter } = require('../../../src/sauce-testreporter');
const testcafe = require('testcafe');

const baseRunCfg = {
  testcafe: {
    projectPath: '../',
    version: '1.11.0'
  },
};
const baseSuite = {
  name: 'fake-suite-name',
  browserName: 'chrome',
  src: ['tests/*.*'],
  selectorTimeout: 1234,
  skipJsErrors: true,
  quarantineMode: true,
  skipUncaughtErrors: true,
  assertionTimeout: 1234,
  pageLoadTimeout: 1234,
  speed: 1234,
  stopOnFirstFail: true,
  disablePageCaching: true,
  disableScreenshots: true,
};

describe('.run', function () {
  let createRunner, runner, backupEnv;
  let date = 0;
  let runReturnValue;
  beforeEach(function () {
    jest.spyOn(Date.prototype, 'toISOString').mockImplementation(() => '' + date++);
    backupEnv = process.env;
    sauceReporter.mockImplementation(() => true);
    utils.getAbsolutePath.mockImplementation((path) => path);
    utils.getSuite.mockImplementation((runCfg, suiteName) => (
      runCfg.suites.find((testSuite) => testSuite.name === suiteName)
    ));
    testcafe.mockImplementation(() => {
      createRunner = jest.fn(function () {
        runner = jest.fn();
        runner.src = jest.fn(function () { return this; });
        runner.browsers = jest.fn(function () { return this; });
        runner.concurrency = jest.fn(function () { return this; });
        runner.reporter = jest.fn(function () { return this; });
        runner.tsConfigPath = jest.fn(function () { return this; });
        runner.clientScriptPath = jest.fn(function () { return this; });
        runner.video = jest.fn(function () { return this; });
        runner.screenshots = jest.fn(function () { return this; });
        runner.run = jest.fn(() => runReturnValue || 0);
        return runner;
      });
      return { createRunner };
    });
  });
  afterEach(function () {
    process.env = backupEnv;
    sauceReporter.mockRestore();
  });
  it('calls TestCafe method with a kitchen sink runCfg (Docker mode)', async function () {
    process.env = {
      SAUCE_USERNAME: 'fake',
      SAUCE_ACCESS_KEY: 'fake',
      SAUCE_VM: '',
    };
    utils.loadRunConfig.mockImplementation(() => ({
      ...baseRunCfg,
      sauce: {
        region: 'staging'
      },
      suites: [
        {
          ...baseSuite,
          screenshots: {
            'takeOnFails': true
          },
          clientScripts: ['fake', 'scripts'],
          tsConfigPath: '/fake/tsconfig/path',
        }
      ],
      saucectlVersion: '0.47.0',
    }));
    const passed = await run('/fake/path/to/runCfg', 'fake-suite-name', 1);
    expect(passed).toBe(true);
    const results = {
      'src': runner.src.mock.calls,
      'browsers': runner.browsers.mock.calls,
      'concurrency': runner.concurrency.mock.calls,
      'reporter': runner.reporter.mock.calls,
      'tsConfigPath': runner.tsConfigPath.mock.calls,
      'clientScriptPath': runner.clientScriptPath.mock.calls,
      'video': runner.video.mock.calls,
      'screenshots': runner.screenshots.mock.calls,
      'run': runner.run.mock.calls,
    };
    expect(results).toMatchSnapshot();
    expect(sauceReporter.mock.calls).toMatchSnapshot();
  });
  it('calls TestCafe method with a kitchen sink runCfg (Sauce VM mode)', async function () {
    process.env = {
      SAUCE_USERNAME: 'fake',
      SAUCE_ACCESS_KEY: 'fake',
      SAUCE_VM: 'truth',
      SAUCE_BROWSER_PATH: 'browser:/fake/browser'
    };
    utils.loadRunConfig.mockImplementation(() => ({
      ...baseRunCfg,
      sauce: {
        metadata: {
          tags: ['1', '2'],
          build: 'build id'
        }
      },
      suites: [
        {
          ...baseSuite,
          screenshots: {
            'takeOnFails': true
          },
          clientScripts: ['fake', 'scripts'],
          tsConfigPath: '/fake/tsconfig/path',
        }
      ]
    }));
    const passed = await run('/fake/path/to/runCfg', 'fake-suite-name', 1);
    expect(passed).toBe(true);
    const results = {
      'src': runner.src.mock.calls,
      'browsers': runner.browsers.mock.calls,
      'concurrency': runner.concurrency.mock.calls,
      'reporter': runner.reporter.mock.calls,
      'tsConfigPath': runner.tsConfigPath.mock.calls,
      'clientScriptPath': runner.clientScriptPath.mock.calls,
      'video': runner.video.mock.calls,
      'screenshots': runner.screenshots.mock.calls,
      'run': runner.run.mock.calls,
    };
    expect(results).toMatchSnapshot();
    expect(sauceReporter.mock.calls).toMatchSnapshot();
  });
  it('reports nothing if no SAUCE_USERNAME or SAUCE_ACCESS_KEY', async function () {
    process.env = {
      SAUCE_USERNAME: '',
      SAUCE_ACCESS_KEY: '',
      SAUCE_VM: '',
    };
    utils.loadRunConfig.mockImplementation(() => ({
      ...baseRunCfg,
      suites: [
        {
          ...baseSuite,
          screenshots: {
            'takeOnFails': true
          },
          clientScripts: ['fake', 'scripts'],
          tsConfigPath: '/fake/tsconfig/path',
        }
      ]
    }));
    await run('/fake/path/to/runCfg', 'fake-suite-name', 1);
    expect(sauceReporter.mock.calls).toEqual([]);
  });
  it('fails if provide a fake browser', async function () {
    utils.loadRunConfig.mockImplementation(() => ({
      ...baseRunCfg,
      suites: [
        {
          ...baseSuite,
          browserName: 'GrahamBrowser',
        }
      ]
    }));
    process.env = {
      SAUCE_VM: '',
    };
    const passed = await run('/fake/path/to/runCfg', 'fake-suite-name', 1);
    expect(passed).toBe(false);
  });
  it('fails if run returns non-zero', async function () {
    utils.loadRunConfig.mockImplementation(() => ({
      ...baseRunCfg,
      suites: [
        {
          ...baseSuite,
        }
      ]
    }));
    process.env = {
      SAUCE_VM: 'truth',
    };
    runReturnValue = 1;
    const passed = await run('/fake/path/to/runCfg', 'fake-suite-name', 1);
    expect(passed).toBe(false);
  });
  it('calls TestCafe with timeout 0 seconds with a kitchen sink runCfg (Docker mode)', async function () {
    process.env = {
      SAUCE_USERNAME: 'fake',
      SAUCE_ACCESS_KEY: 'fake',
      SAUCE_VM: '',
    };
    utils.loadRunConfig.mockImplementation(() => ({
      ...baseRunCfg,
      sauce: {
        region: 'staging'
      },
      suites: [
        {
          ...baseSuite,
          screenshots: {
            'takeOnFails': true
          },
          clientScripts: ['fake', 'scripts'],
          tsConfigPath: '/fake/tsconfig/path',
        }
      ],
      saucectlVersion: '0.47.0',
    }));
    const passed = await run('/fake/path/to/runCfg', 'fake-suite-name', 0);
    expect(passed).toBe(false);
    const results = {
      'src': runner.src.mock.calls,
      'browsers': runner.browsers.mock.calls,
      'concurrency': runner.concurrency.mock.calls,
      'reporter': runner.reporter.mock.calls,
      'tsConfigPath': runner.tsConfigPath.mock.calls,
      'clientScriptPath': runner.clientScriptPath.mock.calls,
      'video': runner.video.mock.calls,
      'screenshots': runner.screenshots.mock.calls,
      'run': runner.run.mock.calls,
    };
    expect(results).toMatchSnapshot();
    expect(sauceReporter.mock.calls).toMatchSnapshot();
  });
  it('calls TestCafe with timeout 0 seconds  with a kitchen sink runCfg (Sauce VM mode)', async function () {
    process.env = {
      SAUCE_USERNAME: 'fake',
      SAUCE_ACCESS_KEY: 'fake',
      SAUCE_VM: 'truth',
      SAUCE_BROWSER_PATH: 'browser:/fake/browser'
    };
    utils.loadRunConfig.mockImplementation(() => ({
      ...baseRunCfg,
      suites: [
        {
          ...baseSuite,
          screenshots: {
            'takeOnFails': true
          },
          clientScripts: ['fake', 'scripts'],
          tsConfigPath: '/fake/tsconfig/path',
        }
      ]
    }));
    const passed = await run('/fake/path/to/runCfg', 'fake-suite-name', 0);
    expect(passed).toBe(false);
    const results = {
      'src': runner.src.mock.calls,
      'browsers': runner.browsers.mock.calls,
      'concurrency': runner.concurrency.mock.calls,
      'reporter': runner.reporter.mock.calls,
      'tsConfigPath': runner.tsConfigPath.mock.calls,
      'clientScriptPath': runner.clientScriptPath.mock.calls,
      'video': runner.video.mock.calls,
      'screenshots': runner.screenshots.mock.calls,
      'run': runner.run.mock.calls,
    };
    expect(results).toMatchSnapshot();
    expect(sauceReporter.mock.calls).toMatchSnapshot();
  });
});