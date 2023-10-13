import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { TestCafeConfig, Suite, CompilerOptions } from './type';

import {
  getArgs,
  loadRunConfig,
  getSuite,
  getAbsolutePath,
  prepareNpmEnv,
  preExec,
} from 'sauce-testrunner-utils';
import {
  generateJunitFile
} from './sauce-testreporter';

async function prepareConfiguration(nodeBin: string, runCfgPath: string, suiteName: string) {
  runCfgPath = getAbsolutePath(runCfgPath);
  const runCfg = loadRunConfig(runCfgPath) as TestCafeConfig;
  runCfg.path = runCfgPath;
  const projectPath = path.join(path.dirname(runCfgPath), runCfg.projectPath || '.');
  const assetsPath = path.join(path.dirname(runCfgPath), '__assets__');
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
  process.env.SAUCE_REPORT_JSON_PATH = path.join(assetsPath, 'sauce-test-report.json');
  process.env.SAUCE_DISABLE_UPLOAD = 'true';

  if (runCfg.testcafe.configFile) {
    const nativeCfg = path.join(projectPath, runCfg.testcafe.configFile);
    if (!fs.existsSync(nativeCfg)) {
      throw new Error(`Could not find Testcafe config file: '${nativeCfg}'`);
    }

    process.env.TESTCAFE_CFG_FILE = nativeCfg;
  }

  // Define node/npm path for execution
  const npmBin = path.join(path.dirname(nodeBin), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  const nodeCtx = {nodePath: nodeBin, npmPath: npmBin};

  // Install NPM dependencies
  await prepareNpmEnv(runCfg, nodeCtx);

  return {projectPath, assetsPath, suite};
}

// Build --compiler-options argument
export function buildCompilerOptions(compilerOptions: CompilerOptions) {
  const args: string[] = [];
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

// Buid the command line to invoke TestCafe with all required parameters
export function buildCommandLine(suite: Suite|undefined, projectPath: string, assetsPath: string, configFile: string|undefined) {
  const cli: (string|number)[] = [];
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

async function runTestCafe(tcCommandLine: (string|number)[], projectPath: string) {
  const nodeBin = process.argv[0];
  const testcafeBin = path.join(__dirname, '..', 'node_modules', 'testcafe', 'lib', 'cli');

  const testcafeProc = spawn(nodeBin, [testcafeBin, ...(tcCommandLine as string[])], {stdio: 'inherit', cwd: projectPath, env: process.env});

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

async function run(nodeBin: string, runCfgPath: string, suiteName: string) {
  const preExecTimeout = 300;

  const {
    projectPath,
    assetsPath,
    suite
  } = await prepareConfiguration(nodeBin, runCfgPath, suiteName);

  if (!await preExec.run({preExec: suite.preExec}, preExecTimeout)) {
    return false;
  }

  process.env.SAUCE_SUITE_NAME = suiteName;
  process.env.SAUCE_ARTIFACTS_DIRECTORY = assetsPath;

  // Copy our runner's TestCafe configuration to __project__/ to preserve the customer's
  // configuration, which will be loaded during TestCafe setup step.
  const configFile = path.join(projectPath, 'sauce-testcafe-config.cjs');
  fs.copyFileSync(path.join(__dirname, 'sauce-testcafe-config.cjs'), configFile);

  const tcCommandLine = buildCommandLine(suite, projectPath, assetsPath, configFile);
  const {hasPassed} = await runTestCafe(tcCommandLine, projectPath);

  try {
    generateJunitFile(assetsPath, suiteName, suite.browserName, suite.platformName || '');
  } catch (err) {
    console.error(`Failed to generate junit file: ${err}`);
  }

  return hasPassed;
}

if (require.main === module) {
  const packageInfo = require(path.join(__dirname, '..', 'package.json'));
  console.log(`Sauce TestCafe Runner ${packageInfo.version}`);
  console.log(`Running TestCafe ${packageInfo.dependencies?.testcafe || ''}`);
  const { nodeBin, runCfgPath, suiteName} = getArgs();

  run(nodeBin, runCfgPath, suiteName)
    .then((passed) => {
      process.exit(passed ? 0 : 1);
    })
    .catch((err) => {
      console.error(`Failed to setup or run TestCafe: ${err.message}`);
      process.exit(1);
    });
}

module.exports = {buildCommandLine, buildCompilerOptions, run};
