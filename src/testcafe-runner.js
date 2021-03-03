const createTestCafe = require('testcafe');
const path = require('path');
const { getArgs, loadRunConfig, getSuite, getAbsolutePath, prepareNpmEnv } = require('sauce-testrunner-utils');
const { sauceReporter } = require('./sauce-testreporter');

async function prepareConfiguration (runCfgPath, suiteName) {
  try {
    runCfgPath = getAbsolutePath(runCfgPath);
    const runCfg = await loadRunConfig(runCfgPath);
    runCfg.path = runCfgPath;
    const projectPath = path.join(path.dirname(runCfgPath), runCfg.projectPath || '.');
    const assetsPath = path.join(path.dirname(runCfgPath), '__assets__');
    const suite = getSuite(runCfg, suiteName);

    // Install NPM dependencies
    let metrics = [];
    let npmMetrics = await prepareNpmEnv(runCfg);
    metrics.push(npmMetrics);

    return { runCfg, projectPath, assetsPath, suite, metrics };
  } catch (e) {
    console.error(`failed to prepare testcafe. Reason: ${e.message}`);
  }
}

async function runTestCafe ({ projectPath, assetsPath, suite, metrics }) {
  let testCafe;
  metrics = metrics || [];

  try {
    // Run the tests now
    const startTime = new Date().toISOString();

    testCafe = await createTestCafe('localhost', 1337, 2337);
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

    // Get the 'src' array and translate it to fully qualified URLs that are part of project path
    let src = Array.isArray(suite.src) ? suite.src : [suite.src];
    src = src.map((srcPath) => path.join(projectPath, srcPath));

    const runnerInstance = runner
      .src(src)
      .browsers(testCafeBrowserName)
      .concurrency(1)
      .reporter([
        { name: 'xunit', output: path.join(assetsPath, 'report.xml') },
        { name: 'json', output: path.join(assetsPath, 'report.json') },
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

    const results = await runnerInstance.run({
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

    const endTime = new Date().toISOString();

    return { browserName, results, startTime, endTime, metrics };

  } catch (e) {
    console.error(`Could not complete test. Reason '${e.message}'`);
    return ;
  } finally {
    try {
      if (testCafe && testCafe.close) {
        testCafe.close();
      }
    } catch (e) {
      console.warn(`Failed to close testcafe :(. Reason: ${e.message}`);
    }
  }
}

async function runReporter ({ results, metrics, assetsPath, browserName, startTime, endTime }) {
  console.log(`Reporting assets in '${assetsPath}' to Sauce Labs`);
  try {
    await sauceReporter({
      browserName,
      assetsPath,
      results,
      metrics,
      assets: [
        path.join(assetsPath, 'report.xml'),
        path.join(assetsPath, 'report.json'),
        path.join(assetsPath, 'video.mp4'),
        path.join(assetsPath, 'console.log'),
      ],
      startTime,
      endTime,
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

  const { results } = testCafeResults;
  const passed = results === 0;
  if (process.env.SAUCE_VM) {
    return passed;
  }
  if (!process.env.SAUCE_USERNAME && !process.env.SAUCE_ACCESS_KEY) {
    console.log('Skipping asset uploads! Remember to setup your SAUCE_USERNAME/SAUCE_ACCESS_KEY');
    return passed;
  }

  await runReporter({ assetsPath: cfg.assetsPath, ...testCafeResults });
  return passed;
}

if (require.main === module) {
  console.log(`Sauce TestCafe Runner ${require(path.join(__dirname, '..', 'package.json')).version}`);
  const { runCfgPath, suiteName } = getArgs();

  run(runCfgPath, suiteName)
      // eslint-disable-next-line promise/prefer-await-to-then
      .then((passed) => {
        process.exit(passed ? 0 : 1);
      })
      // eslint-disable-next-line promise/prefer-await-to-callbacks
      .catch((err) => {
        console.log(err);
        process.exit(1);
      });
}

module.exports = { run };
