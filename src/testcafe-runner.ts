import { ChildProcess, spawn, execSync } from 'child_process';
import fs from 'fs';
import { clearTimeout, setTimeout } from 'node:timers';
import { URL } from 'node:url';
import path from 'path';
import {
  getAbsolutePath,
  getArgs,
  getSuite,
  loadRunConfig,
  preExec,
  prepareNpmEnv,
  zip,
} from 'sauce-testrunner-utils';

import { NodeContext } from 'sauce-testrunner-utils/lib/types';
import { isProxyAvailable, setupProxy } from './network-proxy';
import { generateJUnitFile } from './sauce-testreporter';
import { CompilerOptions, second, Suite, TestCafeConfig } from './type';

function getNpmCliPath(nodeBin: string): string {
  const npmBin = path.join(
    path.dirname(nodeBin),
    'node_modules',
    'npm',
    'bin',
    'npm-cli.js',
  );

  if (fs.existsSync(npmBin)) {
    return npmBin;
  }
  // read paths dynamically if we can't at this stage we should fail.
  const npmMain = require.resolve('npm');
  const npmDir = path.dirname(npmMain);
  const npmCliPath = path.join(npmDir, 'bin', 'npm-cli.js');
  if (!fs.existsSync(npmCliPath)) {
    throw new Error(`Could not locate npm-cli.js at path: ${npmCliPath}`);
  }
  return npmCliPath;
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
  const nodeCtx: NodeContext = {
    nodePath: nodeBin,
    npmPath: getNpmCliPath(nodeBin),
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

  // Force hostname to localhost for Safari. TestCafe auto-detects the system
  // hostname by default, which on cloud VMs may not resolve to 127.0.0.1,
  // causing Safari to be unable to reach TestCafe's reverse proxy.
  if (browserName.toLowerCase() === 'safari') {
    cli.push('--hostname', 'localhost');
    // Retry failed network requests to the test page via Service Workers.
    // Requires --hostname localhost (or HTTPS) to register the Service Worker.
    cli.push('--retry-test-pages');
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

// Locate and install the TestCafe Browser Tools .app bundle into
// ~/.testcafe-browser-tools/. Returns true if the app is present after
// the function completes (either already existed or was installed).
function ensureBrowserToolsApp(): boolean {
  if (process.platform !== 'darwin') {
    return true;
  }

  const homeDir = process.env.HOME || '/Users/chef';
  const browserToolsDestDir = path.join(homeDir, '.testcafe-browser-tools');
  const browserToolsAppDest = path.join(
    browserToolsDestDir,
    'TestCafe Browser Tools.app',
  );

  const appExists = fs.existsSync(browserToolsAppDest);
  console.log(
    `TestCafe Browser Tools app: ${browserToolsAppDest} (exists: ${appExists})`,
  );

  if (appExists) {
    return true;
  }

  // The runner's own node_modules (where testcafe + testcafe-browser-tools live).
  // At runtime __dirname is lib/, so ../node_modules/ is the runner bundle root.
  const runnerNodeModules = path.join(__dirname, '..', 'node_modules');

  // Candidate source paths, ordered by likelihood.
  const candidatePaths = [
    // Primary: runner's node_modules (correct path on Sauce VMs)
    path.join(
      runnerNodeModules,
      'testcafe-browser-tools',
      'bin',
      'mac',
      'TestCafe Browser Tools.app',
    ),
    // Nested inside testcafe package
    path.join(
      runnerNodeModules,
      'testcafe',
      'node_modules',
      'testcafe-browser-tools',
      'bin',
      'mac',
      'TestCafe Browser Tools.app',
    ),
  ];

  // Log what's actually in the bin/mac/ directory for diagnostics
  for (const candidate of candidatePaths) {
    const binMacDir = path.dirname(candidate);
    if (fs.existsSync(binMacDir)) {
      try {
        const contents = execSync(`ls -la "${binMacDir}"`).toString();
        console.log(`Contents of ${binMacDir}:\n${contents}`);
      } catch (e) {
        console.log(`Could not list ${binMacDir}: ${e}`);
      }
    }
  }

  // Try each candidate path
  for (const src of candidatePaths) {
    if (fs.existsSync(src)) {
      console.log(`Found Browser Tools app at: ${src}`);
      try {
        fs.mkdirSync(browserToolsDestDir, { recursive: true });
        execSync(`cp -R "${src}" "${browserToolsDestDir}/"`);
        const installed = fs.existsSync(browserToolsAppDest);
        console.log(`Browser Tools app installed successfully: ${installed}`);
        if (installed) {
          return true;
        }
      } catch (e) {
        console.error(`Failed to copy from ${src}: ${e}`);
      }
    } else {
      console.log(`Browser Tools app not found at candidate: ${src}`);
    }
  }

  // Last resort: use find to search the bundle directory
  const bundleDir = path.join(__dirname, '..');
  console.log(
    `Browser Tools app not found at any candidate path. Searching ${bundleDir}...`,
  );
  try {
    const findResult = execSync(
      `find "${bundleDir}" -name "TestCafe Browser Tools.app" -type d 2>/dev/null | head -5`,
      { timeout: 10000 },
    )
      .toString()
      .trim();

    if (findResult) {
      const foundPath = findResult.split('\n')[0];
      console.log(`Found Browser Tools app via find: ${foundPath}`);
      try {
        fs.mkdirSync(browserToolsDestDir, { recursive: true });
        execSync(`cp -R "${foundPath}" "${browserToolsDestDir}/"`);
        const installed = fs.existsSync(browserToolsAppDest);
        console.log(
          `Browser Tools app installed from find result: ${installed}`,
        );
        if (installed) {
          return true;
        }
      } catch (e) {
        console.error(`Failed to copy from ${foundPath}: ${e}`);
      }
    } else {
      console.log('No TestCafe Browser Tools.app found anywhere in bundle.');
    }
  } catch (e) {
    console.error(`find command failed: ${e}`);
  }

  // Log the destination directory state for diagnostics
  try {
    if (fs.existsSync(browserToolsDestDir)) {
      const contents = execSync(`ls -la "${browserToolsDestDir}"`).toString();
      console.log(`~/.testcafe-browser-tools/ contents:\n${contents}`);
    } else {
      console.log('~/.testcafe-browser-tools/ does not exist.');
    }
  } catch (e) {
    console.log(`Could not list ~/.testcafe-browser-tools/: ${e}`);
  }

  return false;
}

// Clear stale state from ~/.testcafe-browser-tools/ so that a fresh
// retry can re-install cleanly.
function clearBrowserToolsState(): void {
  const homeDir = process.env.HOME || '/Users/chef';
  const browserToolsDestDir = path.join(homeDir, '.testcafe-browser-tools');
  if (fs.existsSync(browserToolsDestDir)) {
    console.log(`Clearing stale browser tools state: ${browserToolsDestDir}`);
    try {
      execSync(`rm -rf "${browserToolsDestDir}"`);
      console.log('Browser tools state cleared.');
    } catch (e) {
      console.error(`Failed to clear browser tools state: ${e}`);
    }
  }
}

// Start a watchdog that monitors the TestCafe process stdout for the browser
// connect URL. If the connection is not established within `timeoutSec` seconds
// of seeing the URL, the watchdog directly opens Safari to the connect URL as a
// fallback. Returns a cleanup function to call when the TestCafe process exits.
function startSafariWatchdog(
  testcafeProc: ChildProcess,
  timeoutSec: number = 15,
): () => void {
  let connectUrl: string | null = null;
  let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
  let connectionEstablished = false;
  let cleaned = false;

  // Match the TestCafe connect URL in debug output.
  // TestCafe logs something like: "http://localhost:1337/browser/connect/ABC123"
  const connectUrlRegex =
    /https?:\/\/localhost:\d+\/browser\/connect\/[a-zA-Z0-9_-]+/;
  // Detect successful connection
  const connectedRegex = /connection status -> '?ready'?|heartbeat/i;

  const onStdout = (data: { toString(): string }) => {
    const text = data.toString();

    if (!connectUrl) {
      const match = text.match(connectUrlRegex);
      if (match) {
        connectUrl = match[0];
        console.log(`[Safari Watchdog] Detected connect URL: ${connectUrl}`);

        // Start the watchdog timer
        watchdogTimer = setTimeout(() => {
          if (!connectionEstablished && connectUrl) {
            console.log(
              `[Safari Watchdog] No connection after ${timeoutSec}s. ` +
                `Force-opening Safari to: ${connectUrl}`,
            );
            // Check if the connect URL is reachable
            try {
              execSync(
                `curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "${connectUrl}"`,
                { timeout: 10000 },
              );
            } catch {
              console.log(
                '[Safari Watchdog] Connect URL not reachable via curl (may still work via Safari)',
              );
            }
            // Try multiple approaches to open Safari
            try {
              execSync(`open -a Safari "${connectUrl}"`, { timeout: 10000 });
              console.log(
                '[Safari Watchdog] Fallback: opened Safari via `open -a Safari`',
              );
            } catch (e) {
              console.log(`[Safari Watchdog] open -a Safari failed: ${e}`);
              try {
                execSync(
                  `osascript -e 'tell application "Safari" to open location "${connectUrl}"'`,
                  { timeout: 10000 },
                );
                console.log(
                  '[Safari Watchdog] Fallback: opened Safari via osascript',
                );
              } catch (e2) {
                console.error(
                  `[Safari Watchdog] All fallback methods failed: ${e2}`,
                );
              }
            }
          }
        }, timeoutSec * 1000);
      }
    }

    if (connectedRegex.test(text)) {
      connectionEstablished = true;
      if (watchdogTimer) {
        clearTimeout(watchdogTimer);
        watchdogTimer = null;
      }
    }
  };

  const onStderr = (data: { toString(): string }) => {
    const text = data.toString();
    if (!connectUrl) {
      const match = text.match(connectUrlRegex);
      if (match) {
        connectUrl = match[0];
        console.log(
          `[Safari Watchdog] Detected connect URL (stderr): ${connectUrl}`,
        );
        // Trigger the same watchdog as above
        onStdout(data);
        return; // avoid double-processing
      }
    }
    if (connectedRegex.test(text)) {
      connectionEstablished = true;
      if (watchdogTimer) {
        clearTimeout(watchdogTimer);
        watchdogTimer = null;
      }
    }
  };

  if (testcafeProc.stdout) {
    testcafeProc.stdout.on('data', onStdout);
  }
  if (testcafeProc.stderr) {
    testcafeProc.stderr.on('data', onStderr);
  }

  // Return cleanup function
  return () => {
    if (cleaned) return;
    cleaned = true;
    if (watchdogTimer) {
      clearTimeout(watchdogTimer);
      watchdogTimer = null;
    }
    if (testcafeProc.stdout) {
      testcafeProc.stdout.removeListener('data', onStdout);
    }
    if (testcafeProc.stderr) {
      testcafeProc.stderr.removeListener('data', onStderr);
    }
  };
}

async function runTestCafe(
  tcCommandLine: (string | number)[],
  projectPath: string,
  timeout: second,
  browserName: string,
): Promise<{ passed: boolean; shouldRetry: boolean }> {
  const nodeBin = process.argv[0];
  const testcafeBin = path.join(
    __dirname,
    '..',
    'node_modules',
    'testcafe',
    'bin',
    'testcafe-with-v8-flag-filter.js',
  );

  console.log(`Starting TestCafe with args: ${tcCommandLine.join(' ')}`);

  // Enable TestCafe debug logging for Safari to capture the browser connection
  // handshake details, including the exact command used to open Safari and
  // whether the testcafe-browser-tools native app succeeded.
  const tcEnv = { ...process.env };
  if (browserName.toLowerCase() === 'safari') {
    tcEnv.DEBUG = 'testcafe:*';
  }

  const testcafeProc = spawn(
    nodeBin,
    [testcafeBin, ...(tcCommandLine as string[])],
    {
      stdio: ['inherit', 'pipe', 'pipe'],
      cwd: projectPath,
      env: tcEnv,
    },
  );

  let shouldRetry = false;
  const connectionErrorRegex =
    /ERROR Cannot establish one or more browser connections/;

  testcafeProc.stdout.pipe(process.stdout);
  testcafeProc.stderr.pipe(process.stderr);

  testcafeProc.stdout.on('data', (data) => {
    if (
      connectionErrorRegex.test(data.toString()) &&
      browserName.toLowerCase() === 'safari'
    ) {
      shouldRetry = true;
    }
  });
  testcafeProc.stderr.on('data', (data) => {
    if (
      connectionErrorRegex.test(data.toString()) &&
      browserName.toLowerCase() === 'safari'
    ) {
      shouldRetry = true;
    }
  });

  // Start Safari watchdog: if TestCafe logs a connect URL but Safari never
  // connects within 15s, the watchdog force-opens Safari to the URL directly.
  let cleanupWatchdog: (() => void) | null = null;
  if (browserName.toLowerCase() === 'safari') {
    cleanupWatchdog = startSafariWatchdog(testcafeProc, 15);
  }

  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<{
    passed: boolean;
    shouldRetry: boolean;
  }>((resolve) => {
    timer = setTimeout(() => {
      console.error(
        `Job timed out after ${timeout} seconds. Killing TestCafe process.`,
      );
      testcafeProc.kill('SIGKILL');
      resolve({ passed: false, shouldRetry: false });
    }, timeout * 1000);
  });

  const testcafePromise = new Promise<{
    passed: boolean;
    shouldRetry: boolean;
  }>((resolve) => {
    testcafeProc.on('close', (code /*, ...args*/) => {
      clearTimeout(timer);
      if (cleanupWatchdog) cleanupWatchdog();
      resolve({ passed: code === 0, shouldRetry });
    });
  });

  try {
    return Promise.race([timeoutPromise, testcafePromise]);
  } catch (e) {
    console.error(`Failed to run TestCafe: ${e}`);
  }

  if (cleanupWatchdog) cleanupWatchdog();
  return { passed: false, shouldRetry: false };
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

  // Log hostname resolution diagnostics to help debug connection failures.
  // If the system hostname doesn't resolve to 127.0.0.1, TestCafe's proxy URL
  // will be unreachable by Safari (which is why we now force --hostname localhost).
  try {
    const hostname = execSync('hostname').toString().trim();
    const resolved = execSync(
      `dscacheutil -q host -a name ${hostname} 2>/dev/null || echo "resolution failed"`,
    )
      .toString()
      .trim();
    console.log(`System hostname: ${hostname}`);
    console.log(`Hostname resolution:\n${resolved}`);
    const loopback = execSync(
      'dscacheutil -q host -a name localhost 2>/dev/null || echo "resolution failed"',
    )
      .toString()
      .trim();
    console.log(`localhost resolution:\n${loopback}`);
  } catch (e) {
    console.log(`Could not check hostname resolution: ${e}`);
  }

  // Pre-install TestCafe Browser Tools native app for Safari.
  // TestCafe opens Safari via a native macOS .app that uses ScriptingBridge
  // (Apple Events) to tell Safari to navigate to the proxy URL. The .app is
  // lazily copied from node_modules to ~/.testcafe-browser-tools/ on first use.
  // On ~5% of Sauce Labs VMs, this lazy copy fails silently, leaving the .app
  // missing. Safari opens to its default homepage instead of the proxy URL,
  // and TestCafe waits for browserInitTimeout then reports the connection error.
  // By pre-installing the .app ourselves, we ensure it's always present.
  if (
    process.platform === 'darwin' &&
    suite.browserName.toLowerCase() === 'safari'
  ) {
    const browserToolsInstalled = ensureBrowserToolsApp();
    if (!browserToolsInstalled) {
      console.warn(
        'WARNING: Could not install TestCafe Browser Tools app. ' +
          'Safari fallback watchdog will attempt direct launch if needed.',
      );
    }
  }

  const tcCommandLine = buildCommandLine(
    suite,
    projectPath,
    assetsPath,
    configFile,
  );

  const MAX_RETRIES = 3;
  let attempts = 0;
  let passed = false;
  let shouldRetry = false;

  do {
    const result = await runTestCafe(
      tcCommandLine,
      projectPath,
      timeout,
      suite.browserName,
    );
    passed = result.passed;
    shouldRetry = result.shouldRetry;
    attempts++;

    if (!passed && shouldRetry && attempts <= MAX_RETRIES) {
      console.log(
        `Connection error detected. Killing Safari and retrying... (Attempt ${attempts}/${MAX_RETRIES})`,
      );

      // Kill Safari and related processes
      try {
        const safariProcs = execSync(
          'ps aux | grep -i "[S]afari" || true',
        ).toString();
        if (safariProcs.trim()) {
          console.log(`Safari processes prekill:\n${safariProcs}`);
        }
        const CryptexesProcs = execSync(
          'ps aux | grep -i "Cryptexes" || true',
        ).toString();
        if (CryptexesProcs.trim()) {
          console.log(`Cryptexes processes prekill:\n${CryptexesProcs}`);
        }
        execSync('killall Safari || true');
        // Also kill any lingering testcafe-browser-tools processes
        execSync('killall testcafe-browser-tools || true');

        const safariProcs2 = execSync(
          'ps aux | grep -i "[S]afari" || true',
        ).toString();
        if (safariProcs2.trim()) {
          console.log(`Safari processes postkill:\n${safariProcs2}`);
        }
      } catch (e) {
        console.log(`Could not kill Safari: ${e}`);
      }

      // Clear stale browser tools state and re-install before retry.
      // This addresses the root cause: if the .app was corrupt or missing,
      // a fresh install gives the next attempt a clean slate.
      clearBrowserToolsState();
      const reinstalled = ensureBrowserToolsApp();
      console.log(`Browser Tools re-installed before retry: ${reinstalled}`);

      // Wait for processes and ports to fully release before retrying
      console.log('Waiting 5 seconds before retry...');
      await new Promise((resolve) => globalThis.setTimeout(resolve, 5000));
    } else {
      shouldRetry = false;
    }
  } while (shouldRetry);

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

module.exports = {
  buildCommandLine,
  buildCompilerOptions,
  run,
};
