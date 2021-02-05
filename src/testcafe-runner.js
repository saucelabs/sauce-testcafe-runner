const createTestCafe = require('testcafe');
const path = require('path');
const { getArgs, loadRunConfig, getSuite, getAbsolutePath } = require('./utils');
const { sauceReporter }   = require('./sauce-testreporter');

async function run (runCfgPath, suiteName) {
  let testCafe, results, browserName, passed;
  try {
    runCfgPath = getAbsolutePath(runCfgPath);
    const runCfg = await loadRunConfig(runCfgPath);
    runCfg.path = runCfgPath;
    const projectPath = path.join(path.dirname(runCfgPath), runCfg.projectPath || '.');
    const assetsPath = path.join(path.dirname(runCfgPath), '__assets__');
    const suite = getSuite(runCfg, suiteName);

    // Run the tests now
    let startTime = new Date().toISOString();

    testCafe = await createTestCafe('localhost', 1337, 2337);
    const runner = testCafe.createRunner();

    const supportedBrowsers = {
      'chrome': 'chrome:headless',
      'firefox': 'firefox:headless:marionettePort=9223'
    }
    browserName = suite.browser;
    const testCafeBrowserName = process.env.SAUCE_VM ? browserName : supportedBrowsers[browserName.toLowerCase()];
    if (!testCafeBrowserName) {
      throw new Error(`Unsupported browser: ${testCafeBrowserName}.`);
    }

    results = await runner
      .src(path.join(projectPath, suite.src))
      .browsers(testCafeBrowserName)
      .concurrency(1)
      .reporter([
        { name: 'xunit', output: path.join(assetsPath, 'report.xml') },
        { name: 'json', output: path.join(assetsPath, 'report.json') },
        'list'
      ])
      .video(assetsPath, {
        singleFile: true,
        failedOnly: false,
        pathPattern: 'video.mp4'
      })
      .run({
        disablePageCaching: process.env.DISABLE_PAGE_CACHING || true,
        disableScreenshot: process.env.DISABLE_SCREENSHOT || true,
        quarantineMode: process.env.QUARANTINE_MODE || false,
        debugMode: process.env.DEBUG_MODE || false
      });

    let endTime = new Date().toISOString();

    // Retain the assets now
    if (process.env.SAUCE_USERNAME && process.env.SAUCE_ACCESS_KEY && !process.env.SAUCE_VM) {
      console.log(`Reporting assets in '${assetsPath}' to Sauce Labs`)
      await sauceReporter({
        browserName, 
        assetsPath,
        results,
        assets: [
          path.join(assetsPath, 'report.xml'),
          path.join(assetsPath, 'report.json'),
          path.join(assetsPath, 'video.mp4'),
          path.join(assetsPath, 'console.log'),
        ],
        startTime,
        endTime,
      });
    } else if (!process.env.SAUCE_VM) {
      console.log('Skipping asset uploads! Remember to setup your SAUCE_USERNAME/SAUCE_ACCESS_KEY')
    }
    passed = results === 0;
  } catch (e) {
    console.error(`Could not complete test. Reason '${e.message}'`);
    passed = false;
  } finally {
    try {
      if (testCafe) {
        testCafe.close();
      }
    } catch (e) {
      console.log(e);
      console.warn('Failed to close testcafe :(');
    }
    return passed;
  }
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
