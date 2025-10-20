import { spawn, exec } from 'child_process';
//import path from 'path';
import fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
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

import { promisify } from 'util';

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));
const execPromise = promisify(exec);

interface SimulatorList {
  devices: Runtimes;
}
interface Runtimes {
  [runtimeIdentifier: string]: SimulatorDevice[];
}

interface SimulatorDevice {
  udid: string;
  isAvailable: boolean;
  name: string;
  state: 'Shutdown' | 'Booted' | 'Creating';
  lastBootedAt?: string;
  dataPath: string;
  logPath: string;
  deviceTypeIdentifier: string;
}

async function listDirectoryContents(directoryPath: string) {
  try {
    // --- Configuration ---

    // By default, this script lists the contents of the directory it's run from.
    // You can change this to a more specific path if needed, for example:
    // const targetDirectory = 'node_modules/testcafe-browser-provider-ios';
    const targetDirectory = directoryPath || '.'; // Use provided path or default to current dir

    // --- End of Configuration ---

    // Resolve the path to get an absolute path for clear logging.
    const absolutePath = path.resolve(process.cwd(), targetDirectory);

    console.log(`\n📁 Listing contents of: ${absolutePath}\n`);

    // Read all entries (files and directories) from the target directory.
    const entries = await fsPromises.readdir(absolutePath, {
      withFileTypes: true,
    });

    if (entries.length === 0) {
      console.log('  -> This directory is empty.');
    } else {
      // Separate directories and files for organized output.
      const dirs = entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
      const files = entries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name);

      // Print directories first.
      if (dirs.length > 0) {
        console.log('  Directories:');
        dirs.forEach((dir) => console.log(`    - 📂 ${dir}/`));
      }

      // Then print files.
      if (files.length > 0) {
        if (dirs.length > 0) console.log(''); // Add a newline for spacing
        console.log('  Files:');
        files.forEach((file) => console.log(`    - 📄 ${file}`));
      }
    }
    console.log('\n✅ Listing complete.');
  } catch (error) {
    console.error('\n❌ An error occurred while listing the directory:');
    if (error instanceof Error) {
      // Provide a more helpful message for the common "not found" error.
      if ('code' in error && error.code === 'ENOENT') {
        console.error(
          `  Error: The directory does not exist at the specified path.`,
        );
      } else {
        console.error(`  ${error.message}`);
      }
    } else {
      console.error(error);
    }
  }
}

async function overwriteFile() {
  try {
    // --- Configuration ---

    // The relative path to the file you want to overwrite.
    const targetFilePath =
      '../lib/node_modules/testcafe-browser-provider-ios/src/index.js';

    // The name of the file containing your new, long content.
    // This script assumes it's in the same directory.
    const sourceContentFile = '../lib/new-index.js';

    // --- End of Configuration ---

    console.log('Running File');
    console.log(__filename);
    //const directoryToScan = '.';
    console.log('One above DIR Files');
    listDirectoryContents('../');
    console.log('One above lib');
    listDirectoryContents('../lib/');

    // Resolve paths to be absolute, which is more reliable.
    // This assumes you run the script from your project's root directory.
    const absoluteTargetPath = path.resolve(process.cwd(), targetFilePath);
    const absoluteSourcePath = path.resolve(process.cwd(), sourceContentFile);

    console.log(`Reading new content from: ${absoluteSourcePath}`);

    // Read the entire content from your source file.
    const newContent = await fsPromises.readFile(absoluteSourcePath, 'utf-8');

    console.log(`Writing content to: ${absoluteTargetPath}`);

    // Write the content to the target file.
    // This will completely overwrite the file if it exists, or create it if it doesn't.
    await fsPromises.writeFile(absoluteTargetPath, newContent, 'utf-8');

    console.log('\n✅ File overwrite successful!');
    console.log(`Successfully overwrote ${targetFilePath}`);
  } catch (error) {
    console.error('\n❌ An error occurred during the file overwrite process:');
    // We check if the error is an object and has a message property for better logging.
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(error);
    }
  }
}

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

  /*
  console.log('System load before delay:');
  spawn('uptime', [], { stdio: 'inherit' });
  await delay(15000);
  console.log('System load after delay:');
  spawn('uptime', [], { stdio: 'inherit' });
  console.log(Date.now());
  */

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

  if (process.platform === 'darwin') {
    overwriteFile();
    //startSimulatorPolling(timeout);
    const testCafeBrowserName = process.env.SAUCE_BROWSER_PATH;
    if (!testCafeBrowserName) {
      throw new Error('SAUCE_BROWSER_PATH is not set.');
    }
    const parts = testCafeBrowserName.split(':');
    if (parts.length !== 3 || parts[0].toLowerCase() !== 'ios') {
      throw new Error(
        'Invalid browser name format. Expected "ios:Device Name:Runtime Version"',
      );
    }
    const deviceName = parts[1];
    const runtimeVersion = parts[2]; // e.g., "iOS 14.3"
    console.log(
      `Preparing to launch device "${deviceName}" on runtime "${runtimeVersion}".`,
    );

    const runtimeKey = `com.apple.CoreSimulator.SimRuntime.${runtimeVersion.replace(/[.\s]/g, '-')}`;
    console.log(`Searching for runtime key: "${runtimeKey}"`);
    console.log('Executing: "xcrun simctl list devices -j"');
    const { stdout } = await execPromise('xcrun simctl list devices -j');
    const simulatorData: SimulatorList = JSON.parse(stdout);
    console.log(simulatorData);
    console.log(runtimeKey);
    console.log(deviceName);
    const devicesForRuntime = simulatorData.devices[runtimeKey];

    console.log(
      `Found devices for runtime "${runtimeVersion}". Searching for "${deviceName}"...`,
    );

    const targetDevice = devicesForRuntime.find(
      (device) => device.name === deviceName && device.isAvailable,
    );

    // 5. Check if a matching device was found
    if (!targetDevice) {
      throw new Error(
        `Device "${deviceName}" is not available for runtime "${runtimeVersion}".`,
      );
    }

    console.log(
      `Found available device: ${targetDevice.name} (State: ${targetDevice.state}, UDID: ${targetDevice.udid})`,
    );

    // 6. Boot the Simulator
    // We check the device's state to avoid trying to boot an already running simulator.
    if (targetDevice.state === 'Shutdown') {
      console.log(
        `Device is shutdown. Booting simulator with UDID: ${targetDevice.udid}`,
      );
      await execPromise(
        `open -a Simulator --args -CurrentDeviceUDID ${targetDevice.udid}`,
      );
      await delay(3000);
      await execPromise(`xcrun simctl boot ${targetDevice.udid}`);
      await delay(5000);
      console.log(`Successfully initiated boot for "${deviceName}".`);
      process.env.DEBUG = 'testcafe:browser-provider-ios';
    } else {
      console.log(
        `"${deviceName}" is already in state: "${targetDevice.state}". No boot action needed.`,
      );
    }
  }
  console.log('System load before running TestCafe:');
  spawn('uptime', [], { stdio: 'inherit' });

  const tcCommandLine = buildCommandLine(
    suite,
    projectPath,
    assetsPath,
    configFile,
  );
  const passed = await runTestCafe(tcCommandLine, projectPath, timeout);

  console.log('System load after running TestCafe:');
  spawn('uptime', [], { stdio: 'inherit' });

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
