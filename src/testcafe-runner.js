const path = require('path');
const fs = require('fs');
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
    console.error(e);
  }
}

// Build --compiler-options argument
function buildCompilerOptions (compilerOptions) {
  const args = [];
  if (compilerOptions?.typescript?.configPath) {
    args.push(`typescript.configPath='${compilerOptions?.typescript?.configPath}'`);
  }
  if (compilerOptions?.typescript?.customCompilerModulePath) {
    args.push(`typescript.customCompilerModulePath='${compilerOptions?.typescript?.customCompilerModulePath}'`);
  }
  for (const key in compilerOptions?.typescript?.options) {
    args.push(`typescript.options.${key}=${compilerOptions?.typescript?.options[key]}`);
  }
  return args.join(',');
}

// Buid the command line to invoke TestCafe with all required parameters
function buildCommandLine (suite, projectPath, assetsPath) {
  const cli = [];

  // Browser support
  const supportedBrowsers = {
    'chrome': 'chrome:headless',
    'firefox': 'firefox:headless:marionettePort=9223'
  };
  const browserName = suite.browserName;
  let testCafeBrowserName = process.env.SAUCE_VM ? browserName : supportedBrowsers[browserName.toLowerCase()];
  if (process.env.SAUCE_VM) {
    if (process.env.SAUCE_BROWSER_PATH) {
      testCafeBrowserName = process.env.SAUCE_BROWSER_PATH;
    }
    if (suite.headless) {
      testCafeBrowserName = `${testCafeBrowserName}:headless`;
    }
  }
  if (!testCafeBrowserName) {
    throw new Error(`Unsupported browser: ${browserName}.`);
  }
  if (suite.browserArgs && suite.browserArgs.length > 0) {
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
  if (suite.compilerOptions) {
    const options = buildCompilerOptions(suite.compilerOptions);
    if (options) {
      cli.push('--compiler-options', options);
    }
  }

  // Record a video if it's not a VM or if SAUCE_VIDEO_RECORD is set
  const shouldRecordVideo = !suite.disableVideo && (!process.env.SAUCE_VM || process.env.SAUCE_VIDEO_RECORD);
  if (shouldRecordVideo) {
    cli.push(
      '--video', assetsPath,
      '--video-options', 'singleFile=true,failedOnly=false,pathPattern=video.mp4',
    );
  }

  // Screenshots
  if (suite.screenshots) {
    // Set screenshot pattern as fixture name, test name and screenshot #
    // This format prevents nested screenshots and shows only the info that
    // a Sauce session needs
    const pathPattern = '${FIXTURE}__${TEST}__screenshot-${FILE_INDEX}';
    const takeOnFails = suite.screenshots.takeOnFails;
    const fullPage = suite.screenshots.fullPage;
    cli.push('--screenshots', `takeOnFails=${takeOnFails},fullPage=${fullPage},path=${assetsPath},pathPattern=${pathPattern}`);
  }

  if (process.env.HTTP_PROXY) {
    const proxyURL = new URL(process.env.HTTP_PROXY);
    cli.push('--proxy', proxyURL.host);
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
  const sauceReportPath = path.join(assetsPath, 'sauce-test-report.json');
  cli.push('--reporter', `xunit:${xmlReportPath},json:${jsonReportPath},sauce-json:${sauceReportPath},list`);

  return cli;
}

async function runTestCafe (tcCommandLine, projectPath) {
  const nodeBin = process.argv[0];
  const testcafeBin = path.join(__dirname, '..', 'node_modules', 'testcafe', 'lib', 'cli');

  const testcafeProc = spawn(nodeBin, [testcafeBin, ...tcCommandLine], {stdio: 'inherit', cwd: projectPath, env: process.env});

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
  return { startTime, endTime, hasPassed };
}

async function run (runCfgPath, suiteName) {
  const cfg = await prepareConfiguration(runCfgPath, suiteName);
  if (!cfg) {
    return false;
  }

  const tcCommandLine = buildCommandLine(cfg.suite, cfg.projectPath, cfg.assetsPath);
  const { startTime, endTime, hasPassed } = await runTestCafe(tcCommandLine, cfg.projectPath);
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
                      startTime, endTime, results: hasPassed ? 0 : 1, metrics: cfg.metrics, browserName: cfg.suite.browserName, platformName: cfg.platformName });
  return passed;
}

if (require.main === module) {
  console.log(`Sauce TestCafe Runner ${require(path.join(__dirname, '..', 'package.json')).version}`);
  const {runCfgPath, suiteName} = getArgs();

  run(runCfgPath, suiteName)
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

module.exports = {buildCommandLine, buildCompilerOptions, run};
