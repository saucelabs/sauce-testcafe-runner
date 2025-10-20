import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { URL } from 'node:url';
import { setTimeout } from 'node:timers';
import {
  getArgs,
  loadRunConfig,
  getSuite,
  getAbsolutePath,
  prepareNpmEnv,
  preExec,
  zip,
} from 'sauce-testrunner-utils';

import { TestCafeConfig, Suite, CompilerOptions, second } from './type';
import { generateJUnitFile } from './sauce-testreporter';
import { setupProxy, isProxyAvailable } from './network-proxy';
import { NodeContext } from 'sauce-testrunner-utils/lib/types';

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

async function prepareConfiguration(
  nodeBin: string,
  runCfgPath: string,
  suiteName: string,
) {
  runCfgPath = getAbsolutePath(runCfgPath);
  const runCfg = loadRunConfig(runCfgPath) as TestCafeConfig;
  runCfg.path = runCfgPath;
  const projectPath = path.join(
    path.dirname(runCfgPath),
    runCfg.projectPath || '.',
  );
  const assetsPath = path.join(path.dirname(runCfgPath), '__assets__');
  runCfg.assetsPath = assetsPath;
  const suite = getSuite(runCfg, suiteName) as Suite | undefined;
  if (!suite) {
    throw new Error(`Could not find suite '${suiteName}'`);
  }

  // Set env vars
  for (const key in suite.env) {
    process.env[key] = suite.env[key];
  }
  // Config reporters
  process.env.ASSETS_PATH = assetsPath;
  process.env.SAUCE_REPORT_JSON_PATH = path.join(
    assetsPath,
    'sauce-test-report.json',
  );
  process.env.SAUCE_DISABLE_UPLOAD = 'true';

  if (runCfg.testcafe.configFile) {
    const nativeCfg = path.join(projectPath, runCfg.testcafe.configFile);
    if (!fs.existsSync(nativeCfg)) {
      throw new Error(`Could not find Testcafe config file: '${nativeCfg}'`);
    }

    process.env.TESTCAFE_CFG_FILE = nativeCfg;
  }

  // Define node/npm path for execution
  const npmBin = path.join(
    path.dirname(nodeBin),
    '..',
    'lib',
    'node_modules',
    'npm',
    'bin',
    'npm-cli.js',
  );
  const nodeCtx: NodeContext = {
    nodePath: nodeBin,
    npmPath: npmBin,
    useGlobals: !!runCfg.nodeVersion,
  };

  // Install NPM dependencies
  await prepareNpmEnv(runCfg, nodeCtx);

  return { runCfg, projectPath, assetsPath, suite };
}

// Build --compiler-options argument
export function buildCompilerOptions(compilerOptions: CompilerOptions) {
  const args: string[] = [];
  if (compilerOptions?.typescript?.configPath) {
    args.push(
      `typescript.configPath=${compilerOptions?.typescript?.configPath}`,
    );
  }
  if (compilerOptions?.typescript?.customCompilerModulePath) {
    args.push(
      `typescript.customCompilerModulePath=${compilerOptions?.typescript?.customCompilerModulePath}`,
    );
  }
  for (const key in compilerOptions?.typescript?.options) {
    args.push(
      `typescript.options.${key}=${compilerOptions?.typescript?.options[key]}`,
    );
  }
  return args.join(';');
}

// Build the command line string to invoke TestCafe with all required parameters.
export function buildCommandLine(
  suite: Suite | undefined,
  projectPath: string,
  assetsPath: string,
  configFile: string | undefined,
) {
  const cli: (string | number)[] = [];
  if (suite === undefined) {
    return cli;
  }

  const browserName = suite.browserName;
  let testCafeBrowserName = browserName;
  if (process.env.SAUCE_BROWSER_PATH) {
    testCafeBrowserName = process.env.SAUCE_BROWSER_PATH;
  }
  if (suite.headless) {
    testCafeBrowserName = `${testCafeBrowserName}:headless`;
  }
  if (!testCafeBrowserName) {
    throw new Error(`Unsupported browser: ${browserName}.`);
  }
  if (suite.browserArgs && suite.browserArgs.length > 0) {
    const browserArgs = suite.browserArgs.join(' ');
    testCafeBrowserName = testCafeBrowserName + ' ' + browserArgs;
  }

  const browserProfile = process.env.SAUCE_FIREFOX_BROWSER_PROFILE;
  if (browserProfile) {
    const absolutePath = path.join(projectPath, browserProfile);
    console.log(`Using Firefox profile: ${absolutePath}`);
    testCafeBrowserName = `${testCafeBrowserName} -profile ${absolutePath}`;
  }

  cli.push(testCafeBrowserName);

  // Add all sources files/globs
  if (Array.isArray(suite.src)) {
    cli.push(...suite.src);
  } else {
    cli.push(suite.src);
  }

  if (configFile) {
    cli.push('--config-file', configFile);
  }

  if (suite.tsConfigPath) {
    cli.push('--ts-config-path', suite.tsConfigPath);
  }
  if (suite.clientScripts) {
    let clientScriptsPaths = Array.isArray(suite.clientScripts)
      ? suite.clientScripts
      : [suite.clientScripts];
    clientScriptsPaths = clientScriptsPaths.map((clientScriptPath: string) =>
      path.join(projectPath, clientScriptPath),
    );
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
    const flags: string[] = [];
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
  if (suite.esm) {
    cli.push('--esm');
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
      `takeOnFails=${takeOnFails},fullPage=${fullPage},path=${assetsPath},pathPattern=${pathPattern},thumbnails=false`,
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
    const filters: string[] = [];
    for (const key of Object.keys(suite.filter.testMeta)) {
      filters.push(`${key}=${suite.filter.testMeta[key]}`);
    }
    cli.push('--test-meta', filters.join(','));
  }
  if (suite.filter && suite.filter.fixtureMeta) {
    const filters: string[] = [];
    for (const key of Object.keys(suite.filter.fixtureMeta)) {
      filters.push(`${key}=${suite.filter.fixtureMeta[key]}`);
    }
    cli.push('--fixture-meta', filters.join(','));
  }

  return cli;
}

// isCDPDisabled checks if TestCafe has CDP disabled.
// Starting from TestCafe version 3.0.0 and beyond, it employs Native Automation
// to automate Chromium-based browsers using the native CDP protocol.
// If the 'disableNativeAutomation' setting is enabled in the configuration,
// it indicates that the CDP connection is disabled, and TestCafe uses its own
// proxy to communicate with the browser.
function isCDPDisabled(projectPath: string) {
  const cfg = require(path.join(projectPath, 'sauce-testcafe-config.cjs'));
  return cfg.disableNativeAutomation;
}

// Chrome and Edge are both Chromium-based browsers.
function isChromiumBased(browser: string) {
  return browser === 'chrome' || browser === 'microsoftedge';
}

async function runTestCafe(
  tcCommandLine: (string | number)[],
  projectPath: string,
  timeout: second,
) {
  const nodeBin = process.argv[0];
  const testcafeBin = path.join(
    __dirname,
    '..',
    'node_modules',
    'testcafe',
    'bin',
    'testcafe-with-v8-flag-filter.js',
  );

  const testcafeProc = spawn(
    nodeBin,
    [testcafeBin, ...(tcCommandLine as string[])],
    {
      stdio: 'inherit',
      cwd: projectPath,
      env: process.env,
    },
  );

  const timeoutPromise = new Promise<boolean>((resolve) => {
    setTimeout(() => {
      console.error(`Job timed out after ${timeout} seconds`);
      resolve(false);
    }, timeout * 1000);
  });

  const testcafePromise = new Promise<boolean>((resolve) => {
    testcafeProc.on('close', (code /*, ...args*/) => {
      resolve(code === 0);
    });
  });

  try {
    return Promise.race([timeoutPromise, testcafePromise]);
  } catch (e) {
    console.error(`Failed to run TestCafe: ${e}`);
  }

  return false;
}

function zipArtifacts(runCfg: TestCafeConfig) {
  if (!runCfg.artifacts || !runCfg.artifacts.retain) {
    return;
  }
  const archivesMap = runCfg.artifacts.retain;
  Object.keys(archivesMap).forEach((source) => {
    const dest = path.join(runCfg.assetsPath, archivesMap[source]);
    try {
      zip(path.dirname(runCfg.path), source, dest);
    } catch (err) {
      console.error(
        `Zip file creation failed for destination: "${dest}", source: "${source}". Error: ${err}.`,
      );
    }
  });
}

async function run(nodeBin: string, runCfgPath: string, suiteName: string) {
  const preExecTimeout = 300;

  const { runCfg, projectPath, assetsPath, suite } = await prepareConfiguration(
    nodeBin,
    runCfgPath,
    suiteName,
  );

  console.log('System load before delay:');
  spawn('uptime', [], { stdio: 'inherit' });
  await delay(15000);
  console.log('System load after delay:');
  spawn('uptime', [], { stdio: 'inherit' });
  console.log(Date.now());

  if (!(await preExec.run({ preExec: suite.preExec }, preExecTimeout))) {
    return false;
  }

  process.env.SAUCE_SUITE_NAME = suiteName;
  process.env.SAUCE_ARTIFACTS_DIRECTORY = assetsPath;

  // Copy our runner's TestCafe configuration to __project__/ to preserve the customer's
  // configuration, which will be loaded during TestCafe setup step.
  const configFile = path.join(projectPath, 'sauce-testcafe-config.cjs');
  fs.copyFileSync(
    path.join(__dirname, 'sauce-testcafe-config.cjs'),
    configFile,
  );

  // TestCafe used a reverse proxy for browser automation before.
  // With TestCafe 3.0.0 and later, native automation mode was enabled by default,
  // see https://testcafe.io/documentation/404237/guides/intermediate-guides/native-automation-mode,
  // introducing CDP support for Chrome and Edge.
  // This means that HTTP requests can't be routed through the reverse proxy anymore.
  // Now, we need to set up an OS-level proxy connection.
  if (
    isChromiumBased(suite.browserName) &&
    !isCDPDisabled(projectPath) &&
    isProxyAvailable()
  ) {
    setupProxy();
  }

  // saucectl suite.timeout is in nanoseconds, convert to seconds
  const timeout = (suite.timeout || 0) / 1_000_000_000 || 30 * 60; // 30min default

  const tcCommandLine = buildCommandLine(
    suite,
    projectPath,
    assetsPath,
    configFile,
  );
  const passed = await runTestCafe(tcCommandLine, projectPath, timeout);

  try {
    generateJUnitFile(
      assetsPath,
      suiteName,
      suite.browserName,
      suite.platformName || '',
    );
  } catch (e) {
    console.warn('Skipping JUnit file generation:', e);
  }
  zipArtifacts(runCfg);

  return passed;
}

if (require.main === module) {
  const packageInfo = require(path.join(__dirname, '..', 'package.json'));
  console.log(`Sauce TestCafe Runner ${packageInfo.version}`);
  console.log(`Running TestCafe ${packageInfo.dependencies?.testcafe || ''}`);
  const { nodeBin, runCfgPath, suiteName } = getArgs();

  run(nodeBin, runCfgPath, suiteName)
    .then((passed) => {
      process.exit(passed ? 0 : 1);
    })
    .catch((err) => {
      console.error(`Failed to setup or run TestCafe: ${err.message}`);
      process.exit(1);
    });
}

module.exports = { buildCommandLine, buildCompilerOptions, run };
