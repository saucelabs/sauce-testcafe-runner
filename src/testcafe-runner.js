(async() => {
  const createTestCafe = require('testcafe');
  const testCafe       = await createTestCafe('localhost', 1337, 1338);
  const runner         = testCafe.createRunner();
  const { sauceReporter }   = require('./sauce-testreporter');

  const supportedBrowsers = {
    'chrome': 'chrome:headless',
    'firefox': 'firefox:headless:marionettePort=9223'
  }
  const browserName = process.env.BROWSER_NAME || 'chrome';
  const testCafeBrowserName = supportedBrowsers[browserName.toLowerCase()];
  if (!testCafeBrowserName) {
    console.error(`Unsupported browser: ${browserName}. Sorry.`);
    process.exit(1);
  }
  let results = await runner
    .src([
      'tests/**/?(*.)+(spec|test).[jt]s?(x)'
    ])
    .browsers(testCafeBrowserName)
    .concurrency(1)
    .reporter([
      { name: 'xunit', output: 'reports/report.xml' },
      { name: 'json', output: 'reports/report.json' },
      'list'
    ])
    .video('reports/', {
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

  try {
    testCafe.close();
  }catch (e) {
    console.log(e);
    console.warn('Failed to close testcafe :(');
  }
  if (process.env.SAUCE_USERNAME && process.env.SAUCE_ACCESS_KEY) {
    await sauceReporter(browserName, [
      'reports/report.xml',
      'reports/report.json',
      'reports/video.mp4'
    ], results);
  } else {
    console.log('Skipping asset uploads! Remeber to setup your SAUCE_USERNAME/SAUCE_ACCESS_KEY')
  }
  process.exit(results === 0 ? 0 : 1);
})();