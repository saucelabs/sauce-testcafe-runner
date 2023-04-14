import { spawn } from 'child_process';
import _ from 'lodash';
import stream from 'stream';
import path from 'path';
import fs from 'fs';

import {
  getArgs,
  loadRunConfig,
  getSuite,
  getAbsolutePath,
  prepareNpmEnv,
  preExec,
} from 'sauce-testrunner-utils';
import {
  sauceReporter,
  generateJunitFile
} from './sauce-testreporter';

async function prepareConfiguration (nodeBin: string, runCfgPath: string, suiteName: string) {
  try {
    runCfgPath = getAbsolutePath(runCfgPath);
    const runCfg: any = await loadRunConfig(runCfgPath);
    runCfg.path = runCfgPath;
    const projectPath = path.join(path.dirname(runCfgPath), runCfg.projectPath || '.');
    const assetsPath = path.join(path.dirname(runCfgPath), '__assets__');
    const suite = getSuite(runCfg, suiteName);
    const metadata = runCfg.sauce.metadata || {};
    const saucectlVersion = process.env.SAUCE_SAUCECTL_VERSION;

    // Set env vars
    for (const key in suite?.env) {
      process.env[key] = suite?.env[key];
    }

    // Define node/npm path for execution
    const npmBin = path.join(path.dirname(nodeBin), 'node_modules', 'npm', 'bin', 'npm-cli.js');
    const nodeCtx = { nodePath: nodeBin, npmPath: npmBin };

    // Install NPM dependencies
    let metrics = [];
    let npmMetrics = await prepareNpmEnv(runCfg, nodeCtx);
    metrics.push(npmMetrics);

    return { runCfg, projectPath, assetsPath, suite, metrics, metadata, saucectlVersion };
  } catch (e: any) {
    console.error(`failed to prepare testcafe. Reason: ${e?.message}`);
  }
}

async function runReporter (
  suiteName: string,
  results: number,
  metrics: any,
  assetsPath: string,
  browserName: string,
  startTime: string,
  endTime: string,
  region: string,
  metadata: any) {
  try {
    console.log('Preparing assets');

    const streamAssets = function (files: string[]) {
      const assets = [];
      for (const f of files) {
        if (fs.existsSync(path.join(assetsPath, f))) {
          assets.push({
            filename: f,
            data: fs.createReadStream(path.join(assetsPath, f))
          });
        }
      }

      return assets;
    };

    let assets = streamAssets(
      [
        'report.xml',
        'report.json',
        'console.log',
        'video.mp4',
        'junit.xml',
        'sauce-test-report.json'
      ]
    );

    // Upload metrics
    for (let [, mt] of Object.entries(metrics)) {
      const val = mt as any;
      if (_.isEmpty(val?.data)) {
        continue;
      }

      const r = new stream.Readable();
      //r.push(JSON.stringify(val?.data, ' ', 2));
      r.push(JSON.stringify(val?.data));
      r.push(null);

      assets.push({
        filename: val?.name,
        data: r as fs.ReadStream,
      });
    }

    await sauceReporter(
      suiteName,
      browserName,
      assets,
      results,
      //assetsPath,
      //metrics,
      startTime,
      endTime,
      region,
      metadata,
    );
  } catch (e) {
    console.error(`Reporting to Sauce Labs failed:`, e);
  }
}

// Build --compiler-options argument
function buildCompilerOptions (compilerOptions: any) {
  const args = [];
  if (compilerOptions?.typescript?.configPath) {
    args.push(`typescript.configPath=${compilerOptions?.typescript?.configPath}`);
  }
  if (compilerOptions?.typescript?.customCompilerModulePath) {
    args.push(`typescript.customCompilerModulePath=${compilerOptions?.typescript?.customCompilerModulePath}`);
  }
  for (const key in compilerOptions?.typescript?.options) {
    args.push(`typescript.options.${key}=${compilerOptions?.typescript?.options[key]}`);
  }
  return args.join(';');
}

function getBrowserNameInDocker (browserName: string) {
  if (browserName === 'chrome') {
    return 'chrome:headless';
  }
  if (browserName === 'firefox') {
    return 'firefox:headless:marionettePort=9223';
  }
  return '';
}

// Buid the command line to invoke TestCafe with all required parameters
function buildCommandLine (suite: any, projectPath: string, assetsPath: string) {
  const cli = [];

  const browserName = suite.browserName;
  let testCafeBrowserName = process.env.SAUCE_VM ? browserName : getBrowserNameInDocker(browserName.toLowerCase());
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
    clientScriptsPaths = clientScriptsPaths.map((clientScriptPath: string) => path.join(projectPath, clientScriptPath));
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
  if (suite.ajaxRequestTimeout) {
    cli.push('--ajax-request-timeout', suite.ajaxRequestTimeout);
  }
  if (suite.pageRequestTimeout) {
    cli.push('--page-request-timeout', suite.pageRequestTimeout);
  }
  if (suite.browserInitTimeout) {
    cli.push('--browser-init-timeout', suite.browserInitTimeout);
  }
  if (suite.testExecutionTimeout) {
    cli.push('--test-execution-timeout', suite.testExecutionTimeout);
  }
  if (suite.runExecutionTimeout) {
    cli.push('--run-execution-timeout', suite.runExecutionTimeout);
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
    // a Sauce session needs.
    // WARNING: TestCafe does not respect the pattern in case of error screenshots and uses '${FILE_INDEX}.png'.
    // However, if ${FILE_INDEX} precedes ${TEST} it works: https://github.com/DevExpress/testcafe/issues/7014
    const pathPattern = '${FILE_INDEX} - ${FIXTURE} - ${TEST}.png';
    const takeOnFails = suite.screenshots.takeOnFails;
    const fullPage = suite.screenshots.fullPage;
    cli.push(
      '--screenshots',
      `takeOnFails=${takeOnFails},fullPage=${fullPage},path=${assetsPath},pathPattern=${pathPattern},thumbnails=false`
    );
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
  cli.push('--reporter', `xunit:${xmlReportPath},json:${jsonReportPath},saucelabs,list`);

  // Configure reporters
  process.env.SAUCE_DISABLE_UPLOAD = 'true';
  process.env.SAUCE_REPORT_JSON_PATH = sauceReportPath;

  return cli;
}

async function runTestCafe (tcCommandLine: string[], projectPath: string) {
  const nodeBin = process.argv[0];
  const testcafeBin = path.join(__dirname, '..', 'node_modules', 'testcafe', 'lib', 'cli');

  const testcafeProc = spawn(nodeBin, [testcafeBin, ...tcCommandLine], {stdio: 'inherit', cwd: projectPath, env: process.env});

  const testcafePromise = new Promise<boolean>((resolve) => {
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

async function run (nodeBin: string, runCfgPath: string, suiteName: string) {
  const preExecTimeout = 300;

  const cfg = await prepareConfiguration(nodeBin, runCfgPath, suiteName);
  if (!cfg) {
    return false;
  }
  const suite = {
    preExec: (cfg.suite as any).preExec
  };

  if (!await preExec.run(suite, preExecTimeout)) {
    return false;
  }
  process.env.SAUCE_SUITE_NAME = suiteName;
  process.env.SAUCE_ARTIFACTS_DIRECTORY = cfg.assetsPath;

  const tcCommandLine = buildCommandLine(cfg.suite, cfg.projectPath, cfg.assetsPath);
  const { startTime, endTime, hasPassed } = await runTestCafe(tcCommandLine, cfg.projectPath);
  try {
    generateJunitFile(cfg.assetsPath, suiteName, (cfg.suite as any).browserName, (cfg.suite as any).platformName);
  } catch (err) {
    console.error(`Failed to generate junit file: ${err}`);
  }

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
  await runReporter(
    suiteName,
    hasPassed ? 0 : 1,
    cfg.metrics,
    cfg.assetsPath,
    (cfg.suite as any).browserName,
    startTime || '',
    endTime || '',
    region,
    cfg.metadata,
  );
  return passed;
}

if (require.main === module) {
  const packageInfo = require(path.join(__dirname, '..', 'package.json'));
  console.log(`Sauce TestCafe Runner ${packageInfo.version}`);
  console.log(`Running TestCafe ${packageInfo.dependencies?.testcafe || ''}`);
  const { nodeBin, runCfgPath, suiteName} = getArgs();

  run(nodeBin, runCfgPath, suiteName)
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