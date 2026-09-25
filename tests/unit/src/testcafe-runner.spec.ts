jest.mock('testcafe');
jest.mock('sauce-testrunner-utils');
jest.mock('../../../lib/sauce-testreporter');
import {
  buildCommandLine,
  buildCompilerOptions,
  isBrowserDiscoveryFailure,
} from '../../../src/testcafe-runner';
import { Suite, CompilerOptions } from '../../../src/type';

interface ProcessEnv {
  [key: string]: string | undefined;
}

describe('.buildCommandLine', function () {
  let OLD_ENV: ProcessEnv;
  beforeEach(function () {
    OLD_ENV = process.env;
  });
  afterEach(function () {
    process.env = OLD_ENV;
  });

  it('most basic config', function () {
    const suite: Suite = {
      browserName: 'firefox',
      src: ['**/*.test.js'],
      name: 'unit test',
    };
    const cli = buildCommandLine(
      suite,
      '/fake/project/path',
      '/fake/assets/path',
      '/fake/configFile/path',
    );
    expect(cli).toMatchObject([
      'firefox',
      '**/*.test.js',
      '--config-file',
      '/fake/configFile/path',
    ]);
  });

  it('most basic config with typescript options', function () {
    const suite: Suite = {
      name: 'unit test',
      browserName: 'firefox',
      src: ['**/*.test.js'],
      compilerOptions: {
        typescript: {
          customCompilerModulePath: '/compiler/path',
          configPath: 'tsconfig.json',
        },
      },
    };
    const cli = buildCommandLine(
      suite,
      '/fake/project/path',
      '/fake/assets/path',
      '/fake/configFile/path',
    );
    expect(cli).toMatchObject([
      'firefox',
      '**/*.test.js',
      '--config-file',
      '/fake/configFile/path',
      '--compiler-options',
      'typescript.configPath=tsconfig.json;typescript.customCompilerModulePath=/compiler/path',
    ]);
  });

  it('basic with filters', function () {
    const suite: Suite = {
      name: 'unit test',
      browserName: 'firefox',
      src: ['**/*.test.js'],
      filter: {
        test: 'fixed-test-name',
        testGrep: '.*test-name.*',
        fixture: 'fixed-fixture-name',
        fixtureGrep: '.*fixture-name.*',
        testMeta: {
          'my-key': 'my-val',
          '2nd-key': '2nd-val',
        },
        fixtureMeta: {
          'my-key': 'my-val',
          '2nd-key': '2nd-val',
        },
      },
    };
    const cli = buildCommandLine(
      suite,
      '/fake/project/path',
      '/fake/assets/path',
      '/fake/configFile/path',
    );
    expect(cli).toMatchObject([
      'firefox',
      '**/*.test.js',
      '--config-file',
      '/fake/configFile/path',
      '--test',
      'fixed-test-name',
      '--fixture',
      'fixed-fixture-name',
      '--test-grep',
      '.*test-name.*',
      '--fixture-grep',
      '.*fixture-name.*',
      '--test-meta',
      'my-key=my-val,2nd-key=2nd-val',
      '--fixture-meta',
      'my-key=my-val,2nd-key=2nd-val',
    ]);
  });

  it('basic with screenshots', function () {
    const suite: Suite = {
      name: 'unit test',
      browserName: 'firefox',
      src: ['**/*.test.js'],
      screenshots: {
        fullPage: true,
        takeOnFails: true,
      },
    };
    const cli = buildCommandLine(
      suite,
      '/fake/project/path',
      '/fake/assets/path',
      '/fake/configFile/path',
    );
    expect(cli).toMatchObject([
      'firefox',
      '**/*.test.js',
      '--config-file',
      '/fake/configFile/path',
      '--screenshots',
      'takeOnFails=true,fullPage=true,path=/fake/assets/path,pathPattern=${FILE_INDEX} - ${FIXTURE} - ${TEST}.png,thumbnails=false',
    ]);
  });

  it('basic with quarantineMode', function () {
    const suite: Suite = {
      name: 'unit test',
      browserName: 'firefox',
      src: ['**/*.test.js'],
      quarantineMode: {
        attemptLimit: 10,
        successThreshold: 3,
      },
    };
    const cli = buildCommandLine(
      suite,
      '/fake/project/path',
      '/fake/assets/path',
      '/fake/configFile/path',
    );
    expect(cli).toMatchObject([
      'firefox',
      '**/*.test.js',
      '--config-file',
      '/fake/configFile/path',
      '--quarantine-mode',
      'attemptLimit=10,successThreshold=3',
    ]);
  });

  it('basic with different flags', function () {
    const suite: Suite = {
      name: 'unit test',
      browserName: 'firefox',
      src: ['**/*.test.js'],
      skipJsErrors: true,
      skipUncaughtErrors: true,
      selectorTimeout: 1000,
      assertionTimeout: 1000,
      pageLoadTimeout: 1000,
      ajaxRequestTimeout: 3000,
      pageRequestTimeout: 3000,
      browserInitTimeout: 4000,
      testExecutionTimeout: 3000,
      runExecutionTimeout: 180000,
      speed: 0.5,
      stopOnFirstFail: true,
      disablePageCaching: true,
      disableScreenshots: true,
    };
    const cli = buildCommandLine(
      suite,
      '/fake/project/path',
      '/fake/assets/path',
      '/fake/configFile/path',
    );
    expect(cli).toMatchObject([
      'firefox',
      '**/*.test.js',
      '--config-file',
      '/fake/configFile/path',
      '--skip-js-errors',
      '--skip-uncaught-errors',
      '--selector-timeout',
      1000,
      '--assertion-timeout',
      1000,
      '--page-load-timeout',
      1000,
      '--ajax-request-timeout',
      3000,
      '--page-request-timeout',
      3000,
      '--browser-init-timeout',
      4000,
      '--test-execution-timeout',
      3000,
      '--run-execution-timeout',
      180000,
      '--speed',
      0.5,
      '--stop-on-first-fail',
      '--disable-page-caching',
      '--disable-screenshots',
    ]);
  });

  it('basic with client scripts', function () {
    const suite: Suite = {
      name: 'unit test',
      browserName: 'firefox',
      src: ['**/*.test.js'],
      clientScripts: ['script.js'],
    };
    const cli = buildCommandLine(
      suite,
      '/fake/project/path',
      '/fake/assets/path',
      '/fake/configFile/path',
    );
    expect(cli).toMatchObject([
      'firefox',
      '**/*.test.js',
      '--config-file',
      '/fake/configFile/path',
      '--client-scripts',
      '/fake/project/path/script.js',
    ]);
  });

  it('basic with tsConfigPath', function () {
    const suite: Suite = {
      name: 'unit tset',
      browserName: 'firefox',
      src: ['**/*.test.js'],
      tsConfigPath: 'tsconfig.json',
    };
    const cli = buildCommandLine(
      suite,
      '/fake/project/path',
      '/fake/assets/path',
      '/fake/configFile/path',
    );
    expect(cli).toMatchObject([
      'firefox',
      '**/*.test.js',
      '--config-file',
      '/fake/configFile/path',
      '--ts-config-path',
      'tsconfig.json',
    ]);
  });

  it('basic with no-array src', function () {
    const suite: Suite = {
      name: 'unit test',
      browserName: 'firefox',
      src: '**/*.test.js',
    };
    const cli = buildCommandLine(
      suite,
      '/fake/project/path',
      '/fake/assets/path',
      '/fake/configFile/path',
    );
    expect(cli).toMatchObject([
      'firefox',
      '**/*.test.js',
      '--config-file',
      '/fake/configFile/path',
    ]);
  });

  it('basic with browserArgs', function () {
    const suite: Suite = {
      name: 'unit test',
      browserName: 'firefox',
      src: '**/*.test.js',
      browserArgs: ['--chrome-fake-param'],
    };
    const cli = buildCommandLine(
      suite,
      '/fake/project/path',
      '/fake/assets/path',
      '/fake/configFile/path',
    );
    expect(cli).toMatchObject([
      'firefox --chrome-fake-param',
      '**/*.test.js',
      '--config-file',
      '/fake/configFile/path',
    ]);
  });

  describe('with env + inside VM', function () {
    const OLD_ENV = process.env;

    afterAll(function () {
      process.env = OLD_ENV;
    });

    it('should use http_proxy', function () {
      process.env.SAUCE_VIDEO_RECORD = 'truthy';
      process.env.SAUCE_BROWSER_PATH = 'D:\\chrome99\\chrome.exe';
      process.env.HTTP_PROXY = 'http://localhost:8080';
      const suite: Suite = {
        name: 'unit test',
        browserName: 'firefox',
        src: '**/*.test.js',
      };
      const cli = buildCommandLine(
        suite,
        '/fake/project/path',
        '/fake/assets/path',
        '/fake/configFile/path',
      );
      expect(cli).toMatchObject([
        'D:\\chrome99\\chrome.exe',
        '**/*.test.js',
        '--config-file',
        '/fake/configFile/path',
        '--proxy',
        'localhost:8080',
      ]);
    });
  });
});

describe('.buildCompilerOptions', function () {
  it('Empty input', function () {
    const input = {};
    const expected = '';
    expect(buildCompilerOptions(input)).toEqual(expected);
  });
  it('TypeScript config file', function () {
    const input = {
      typescript: {
        configPath: './tsconfig.json',
      },
    };
    const expected = `typescript.configPath=./tsconfig.json`;
    expect(buildCompilerOptions(input)).toEqual(expected);
  });
  it('CustomCompilerPath set', function () {
    const input = {
      typescript: {
        customCompilerModulePath: '/path/to/custom/compiler',
      },
    };
    const expected = `typescript.customCompilerModulePath=/path/to/custom/compiler`;
    expect(buildCompilerOptions(input)).toEqual(expected);
  });
  it('With options', function () {
    const input: CompilerOptions = {
      typescript: {
        options: {
          allowUnusedLabels: true,
          noFallthroughCasesInSwitch: true,
          allowUmdGlobalAccess: true,
        },
      },
    };
    const expected =
      'typescript.options.allowUnusedLabels=true;typescript.options.noFallthroughCasesInSwitch=true;typescript.options.allowUmdGlobalAccess=true';
    expect(buildCompilerOptions(input)).toEqual(expected);
  });
  it('All with options', function () {
    const input = {
      typescript: {
        configPath: './tsconfig.json',
        customCompilerModulePath: '/path/to/custom/compiler',
        options: {
          allowUnusedLabels: true,
          noFallthroughCasesInSwitch: true,
          allowUmdGlobalAccess: true,
        },
      },
    };
    const expected = `typescript.configPath=./tsconfig.json;typescript.customCompilerModulePath=/path/to/custom/compiler;typescript.options.allowUnusedLabels=true;typescript.options.noFallthroughCasesInSwitch=true;typescript.options.allowUmdGlobalAccess=true`;
    expect(buildCompilerOptions(input)).toEqual(expected);
  });
});

describe('.isBrowserDiscoveryFailure', function () {
  const hardFailure =
    "ERROR Error: Command failed with exit code 2: C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe -NoProfile -Command Get-Item 'Registry::HKEY_LOCAL_MACHINE\\Software\\Clients\\StartMenuInternet\\*\\shell\\open\\command'";
  const registryWarning =
    'TESTCAFE_BROWSER_TOOLS_REGISTRY_WARNING: HKEY_LOCAL_MACHINE browser query exited with code 1; continuing with partial results. stderr: Get-ItemProperty : Property (default) does not exist at path HKEY_LOCAL_MACHINE\\Software\\Clients\\StartMenuInternet\\Microsoft Edge\\shell\\open\\command.';
  const browserNotFound =
    'ERROR Cannot find the browser. "edge" is neither a known browser alias, nor a path to an executable file.';

  it('detects the unpatched PowerShell hard failure', function () {
    expect(isBrowserDiscoveryFailure(hardFailure)).toBe(true);
  });
  it('detects partial registry results that miss the requested browser', function () {
    expect(
      isBrowserDiscoveryFailure(`${registryWarning}\n${browserNotFound}`),
    ).toBe(true);
  });
  it('ignores a registry warning when the run failed for other reasons', function () {
    expect(
      isBrowserDiscoveryFailure(`${registryWarning}\n 1 of 3 tests failed`),
    ).toBe(false);
  });
  it('ignores a browser-not-found error without a registry warning', function () {
    expect(isBrowserDiscoveryFailure(browserNotFound)).toBe(false);
  });
});
