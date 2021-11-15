const createTestCafe = require('testcafe');
const path = require('path');
const fs = require('fs');
const { isMatch, cloneDeep } = require('lodash');
const {getArgs, loadRunConfig, getSuite, getAbsolutePath, prepareNpmEnv} = require('sauce-testrunner-utils');
const {sauceReporter, generateJunitFile} = require('./sauce-testreporter');
const { spawn } = require('child_process');

async function prepareConfiguration (runCfgPath, suiteName) {
  try {
    runCfgPath = getAbsolutePath(runCfgPath);
    const runCfg = await loadRunConfig(runCfgPath);
    runCfg.path = runCfgPath;
    const projectPath = path.join(path.dirname(runCfgPath), runCfg.projectPath || '.');
    const assetsPath = path.join(path.dirname(runCfgPath), '__assets__');
    const suite = getSuite(runCfg, suiteName);
    const metadata = runCfg.sauce.metadata || {};
    const saucectlVersion = process.env.SAUCE_SAUCECTL_VERSION;

    // Set env vars
    for (const key in suite.env) {
      process.env[key] = suite.env[key];
    }

    // Install NPM dependencies
    let metrics = [];
    let npmMetrics = await prepareNpmEnv(runCfg);
    metrics.push(npmMetrics);

    return { runCfg, projectPath, assetsPath, suite, metrics, metadata, saucectlVersion };
  } catch (e) {
    console.error(`failed to prepare testcafe. Reason: ${e.message}`);
  }
}

// Function derived from TC implementation:
//  => https://github.com/DevExpress/testcafe/blob/master/src/utils/get-filter-fn.js#L18
function buildFilterFunc (filters) {
  let { testGrep, fixtureGrep, test, fixture, testMeta, fixtureMeta } = cloneDeep(filters || {});
  if (testGrep) {
    testGrep = new RegExp(testGrep);
  }
  if (fixtureGrep) {
    fixtureGrep = new RegExp(fixtureGrep);
  }

  return function (tcTestName, tcFixtureName, tcFixturePath, tcTestMeta, tcFixtureMeta) {
    if (test && test !== tcTestName) {
      return false;
    }
    if (fixture && fixture !== tcFixtureName) {
      return false;
    }
    if (testGrep && !testGrep.test(tcTestName)) {
      return false;
    }
    if (fixtureGrep && !fixtureGrep.test(tcFixtureName)) {
      return false;
    }
    if (testMeta && !isMatch(tcTestMeta, testMeta)) {
      return false;
    }
    if (fixtureMeta && !isMatch(tcFixtureMeta, fixtureMeta)) {
      return false;
    }
    return true;
  };
}

async function runTestCafe ({projectPath, assetsPath, suite, metrics}) {
  let testCafe;
  metrics = metrics || [];

  try {
    // Run the tests now
    const startTime = new Date().toISOString();

    const port1 = parseInt(process.env.SAUCE_TESTCAFE_PORT1 || 1337, 10);
    const port2 = parseInt(process.env.SAUCE_TESTCAFE_PORT2 || 2337, 10);
    testCafe = await createTestCafe({port1, port2, hostname: 'localhost'});
    const runner = testCafe.createRunner();

    const supportedBrowsers = {
      'chrome': 'chrome:headless',
      'firefox': 'firefox:headless:marionettePort=9223'
    };
    const browserName = suite.browserName;
    let testCafeBrowserName = process.env.SAUCE_VM ? browserName : supportedBrowsers[browserName.toLowerCase()];
    if (process.env.SAUCE_VM && process.env.SAUCE_BROWSER_PATH) {
      testCafeBrowserName = process.env.SAUCE_BROWSER_PATH;
    }
    if (!testCafeBrowserName) {
      throw new Error(`Unsupported browser: ${testCafeBrowserName}.`);
    }

    if (suite.browserArgs) {
      const browserArgs = suite.browserArgs.join(' ');
      testCafeBrowserName = testCafeBrowserName + ' ' + browserArgs;
    }

    // Get the 'src' array and translate it to fully qualified URLs that are part of project path
    let src = Array.isArray(suite.src) ? suite.src : [suite.src];
    src = src.map((srcPath) => path.join(projectPath, srcPath));

    const runnerInstance = runner
            .src(src)
            .browsers(testCafeBrowserName)
            .concurrency(1)
            .reporter([
              {name: 'xunit', output: path.join(assetsPath, 'report.xml')},
              {name: 'json', output: path.join(assetsPath, 'report.json')},
              'list'
            ]);

    if (suite.tsConfigPath) {
      runnerInstance.tsConfigPath(path.join(projectPath, suite.tsConfigPath));
    }

    if (suite.clientScripts) {
      let clientScriptsPaths = Array.isArray(suite.clientScripts) ? suite.clientScripts : [suite.clientScripts];
      clientScriptsPaths = clientScriptsPaths.map((clientScriptPath) => path.join(projectPath, clientScriptPath));
      runnerInstance.clientScriptPath(clientScriptsPaths);
    }

    // Record a video if it's not a VM or if SAUCE_VIDEO_RECORD is set
    const shouldRecordVideo = !suite.disableVideo && (!process.env.SAUCE_VM || process.env.SAUCE_VIDEO_RECORD);
    if (shouldRecordVideo) {
      runnerInstance.video(assetsPath, {
        singleFile: true,
        failedOnly: false,
        pathPattern: 'video.mp4'
      });
    }

    // Screenshots
    if (suite.screenshots) {
      runnerInstance.screenshots({
        ...suite.screenshots,
        path: assetsPath,
        // Set screenshot pattern as fixture name, test name and screenshot #
        // This format prevents nested screenshots and shows only the info that
        // a Sauce session needs
        pathPattern: '${FIXTURE}__${TEST}__screenshot-${FILE_INDEX}',
      });
    }

    if (process.env.HTTP_PROXY) {
      let proxyURL = new URL(process.env.HTTP_PROXY);
      runnerInstance.useProxy(proxyURL.host);
    }

    const filterFunc = buildFilterFunc(suite.filter);

    const testCafeRunner = runnerInstance.run({
      filter: filterFunc,
      skipJsErrors: suite.skipJsErrors,
      quarantineMode: suite.quarantineMode,
      skipUncaughtErrors: suite.skipUncaughtErrors,
      selectorTimeout: suite.selectorTimeout,
      assertionTimeout: suite.assertionTimeout,
      pageLoadTimeout: suite.pageLoadTimeout,
      speed: suite.speed,
      stopOnFirstFail: suite.stopOnFirstFail,
      disablePageCaching: suite.disablePageCaching,
      disableScreenshots: suite.disableScreenshots,

      // Parameters that aren't supported in cloud or docker:
      debugMode: false,
      debugOnFail: false,
    });

    // saucectl suite.timeout is in nanoseconds
    const timeoutSec = suite.timeout / 1000000000 || 1800;
    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => {
        console.error(`Test timed out after ${timeoutSec} seconds`);
        // 1 means amount of failed tests and will be translated to status code 1 afterwards
        resolve(1);
      }, timeoutSec * 1000);
    });
    const results = await Promise.race([testCafeRunner, timeoutPromise]);

    const endTime = new Date().toISOString();

    return {browserName, results, startTime, endTime, metrics};

  } catch (e) {
    console.error(`Could not complete test. Reason '${e.message}'`);
  } finally {
    try {
      if (testCafe && testCafe.close) {
        await testCafe.close();
      }
    } catch (e) {
      console.warn(`Failed to close testcafe :(. Reason: ${e.message}`);
    }
  }
}

async function runReporter ({ suiteName, results, metrics, assetsPath, browserName, startTime, endTime, region, metadata, saucectlVersion }) {
  try {
    let assets = [
      path.join(assetsPath, 'report.xml'),
      path.join(assetsPath, 'report.json'),
      path.join(assetsPath, 'console.log'),
    ];
    const video = path.join(assetsPath, 'video.mp4');
    if (fs.existsSync(video)) {
      assets.push(video);
    }

    await sauceReporter({
      suiteName,
      browserName,
      assetsPath,
      results,
      metrics,
      assets,
      startTime,
      endTime,
      region,
      metadata,
      saucectlVersion,
    });
  } catch (e) {
    console.error(`Reporting to Sauce Labs failed. Reason '${e.message}'`);
  }
}

async function run (runCfgPath, suiteName) {
  const cfg = await prepareConfiguration(runCfgPath, suiteName);
  if (!cfg) {
    return false;
  }

  const testCafeResults = await runTestCafe(cfg);
  if (!testCafeResults) {
    return false;
  }

  generateJunitFile(cfg.assetsPath, suiteName, cfg.suite.browserName, cfg.suite.platformName);
  const {results} = testCafeResults;
  const passed = results === 0;
  if (process.env.SAUCE_VM) {
    return passed;
  }
  if (!process.env.SAUCE_USERNAME && !process.env.SAUCE_ACCESS_KEY) {
    console.log('Skipping asset uploads! Remember to setup your SAUCE_USERNAME/SAUCE_ACCESS_KEY');
    return passed;
  }

  const region = cfg.runCfg.sauce.region || 'us-west-1';
  await runReporter({ suiteName, assetsPath: cfg.assetsPath, region, metadata: cfg.metadata, saucectlVersion: cfg.saucectlVersion, ...testCafeResults });
  return passed;
}

// Buid the command line to invoke TestCafe with all required parameters
function buildCommandLine (suiteName, runCfg, suite, projectPath, assetsPath) {
  const cli = [];

  // Browser support
  const supportedBrowsers = {
    'chrome': 'chrome:headless',
    'firefox': 'firefox:headless:marionettePort=9223'
  };
  const browserName = suite.browserName;
  let testCafeBrowserName = process.env.SAUCE_VM ? browserName : supportedBrowsers[browserName.toLowerCase()];
  if (process.env.SAUCE_VM && process.env.SAUCE_BROWSER_PATH) {
    testCafeBrowserName = process.env.SAUCE_BROWSER_PATH;
  }
  if (!testCafeBrowserName) {
    throw new Error(`Unsupported browser: ${testCafeBrowserName}.`);
  }
  if (suite.browserArgs) {
    const browserArgs = suite.browserArgs.join(' ');
    testCafeBrowserName = testCafeBrowserName + ' ' + browserArgs;
  }
  cli.push(testCafeBrowserName);

  // Add all sources files/globs
  if (Array.isArray(suite.src)) {
    cli.push(...suite.src);
  } else {
    cli.push(suite.src);
  }

  if (suite.tsConfigPath) {
    cli.push('--ts-config-path', suite.tsConfigPath);
  }
  if (suite.clientScripts) {
    let clientScriptsPaths = Array.isArray(suite.clientScripts) ? suite.clientScripts : [suite.clientScripts];
    clientScriptsPaths = clientScriptsPaths.map((clientScriptPath) => path.join(projectPath, clientScriptPath));
    cli.push('--client-scripts', clientScriptsPaths.join(','));
  }
  if (suite.skipJsErrors) {
    cli.push('--skip-js-errors');
  }
  if (suite.skipUncaughtErrors) {
    cli.push('--skip-uncaught-errors');
  }
  if (suite.selectorTimeout) {
    cli.push('--selector-timeout', suite.selectorTimeout);
  }
  if (suite.assertionTimeout) {
    cli.push('--assertion-timeout', suite.assertionTimeout);
  }
  if (suite.pageLoadTimeout) {
    cli.push('--page-load-timeout', suite.pageLoadTimeout);
  }
  if (suite.speed) {
    cli.push('--speed', suite.speed);
  }
  if (suite.stopOnFirstFail) {
    cli.push('--stop-on-first-fail');
  }
  if (suite.disablePageCaching) {
    cli.push('--disable-page-caching');
  }
  if (suite.disableScreenshots) {
    cli.push('--disable-screenshots');
  }
  if (suite.quarantineMode) {
    const flags = [];
    if (suite.quarantineMode.attemptLimit) {
      flags.push(`attemptLimit=${suite.quarantineMode.attemptLimit}`);
    }
    if (suite.quarantineMode.successThreshold) {
      flags.push(`successThreshold=${suite.quarantineMode.successThreshold}`);
    }
    if (flags.length) {
      cli.push('--quarantine-mode', flags.join(','));
    }
  }

  // Record a video if it's not a VM or if SAUCE_VIDEO_RECORD is set
  const shouldRecordVideo = !suite.disableVideo && (!process.env.SAUCE_VM || process.env.SAUCE_VIDEO_RECORD);
  if (shouldRecordVideo) {
    cli.push(
      `--video`,
      `--video-options singleFile=true,failedOnly=false,pathPattern=video.mp4`,
    );
  }

  // Screenshots
  if (suite.screenshots) {
    // Set screenshot pattern as fixture name, test name and screenshot #
    // This format prevents nested screenshots and shows only the info that
    // a Sauce session needs
    const pathPattern = '${FIXTURE}__${TEST}__screenshot-${FILE_INDEX}';
    cli.push(`--screenshots takeOnFails=true,fullPage=true,path=${assetsPath},pathPattern=${pathPattern}`);
  }

  if (process.env.HTTP_PROXY) {
    const proxyURL = new URL(process.env.HTTP_PROXY);
    cli.push('--proxy', proxyURL);
  }

  // Filters
  if (suite.filter && suite.filter.test) {
    cli.push('--test', suite.filter.test);
  }
  if (suite.filter && suite.filter.fixture) {
    cli.push('--fixture', suite.filter.fixture);
  }
  if (suite.filter && suite.filter.testGrep) {
    cli.push('--test-grep', suite.filter.testGrep);
  }
  if (suite.filter && suite.filter.fixtureGrep) {
    cli.push('--fixture-grep', suite.filter.fixtureGrep);
  }
  if (suite.filter && suite.filter.testMeta) {
    const filters = [];
    for (const key of Object.keys(suite.filter.testMeta)) {
      filters.push(`${key}=${suite.filter.testMeta[key]}`);
    }
    cli.push('--test-meta', filters.join(','));
  }
  if (suite.filter && suite.filter.fixtureMeta) {
    const filters = [];
    for (const key of Object.keys(suite.filter.fixtureMeta)) {
      filters.push(`${key}=${suite.filter.fixtureMeta[key]}`);
    }
    cli.push('--fixture-meta', filters.join(','));
  }

  // Reporters
  const xmlReportPath = path.join(assetsPath, 'report.xml');
  const jsonReportPath = path.join(assetsPath, 'report.json');
  cli.push('--reporter', `xunit:${xmlReportPath},json:${jsonReportPath},list`);

  return cli;
}

async function runTestCafeV2 (runCfgPath, suiteName) {
  const cfg = await prepareConfiguration(runCfgPath, suiteName);
  if (!cfg) {
    return false;
  }

  const tcCommandLine = buildCommandLine(suiteName, cfg.runCfg, cfg.suite, cfg.projectPath, cfg.assetsPath);

  // invoke command line
  const nodeBin = process.argv[0];
  const testcafeBin = path.join(`${__dirname}/../node_modules/.bin/`, 'testcafe');

  console.log([nodeBin, testcafeBin, ...tcCommandLine]);
  const testcafeProc = spawn(nodeBin, [testcafeBin, ...tcCommandLine], {stdio: 'inherit', cwd: cfg.projectPath, env: process.env});

  const testcafePromise = new Promise((resolve) => {
    testcafeProc.on('close', (code /*, ...args*/) => {
      const hasPassed = code === 0;
      resolve(hasPassed);
    });
  });

  let startTime, endTime, hasPassed = false;
  try {
    startTime = new Date().toISOString();
    hasPassed = await testcafePromise;
    endTime = new Date().toISOString();
  } catch (e) {
    console.error(`Could not complete job. Reason: ${e}`);
  }
  // return {browserName, results, startTime, endTime, metrics};


  // Rework Generated JSON
  generateJunitFile(cfg.assetsPath, suiteName, cfg.suite.browserName, cfg.suite.platformName);

  // Publish results
  const passed = hasPassed;
  if (process.env.SAUCE_VM) {
    return passed;
  }
  if (!process.env.SAUCE_USERNAME && !process.env.SAUCE_ACCESS_KEY) {
    console.log('Skipping asset uploads! Remember to setup your SAUCE_USERNAME/SAUCE_ACCESS_KEY');
    return passed;
  }

  const region = cfg.runCfg.sauce.region || 'us-west-1';
  await runReporter({ suiteName, assetsPath: cfg.assetsPath, region, metadata: cfg.metadata, saucectlVersion: cfg.saucectlVersion,
                      startTime, endTime, results: hasPassed ? 0 : 1, metrics: {}, browserName: cfg.suite.browserName, platformName: cfg.platformName });
  return passed;
}

if (require.main === module) {
  console.log(`Sauce TestCafe Runner ${require(path.join(__dirname, '..', 'package.json')).version}`);
  const {runCfgPath, suiteName} = getArgs();

  runTestCafeV2(runCfgPath, suiteName)
    // eslint-disable-next-line promise/prefer-await-to-then
    .then((passed) => {
      process.exit(passed ? 0 : 1);
    })
    // eslint-disable-next-line promise/prefer-await-to-callbacks
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = {run, buildFilterFunc};
