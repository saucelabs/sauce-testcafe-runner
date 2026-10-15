import fs from 'fs';
import os from 'os';
import path from 'path';

interface ProcessEnv {
  [key: string]: string | undefined;
}

interface Reporter {
  name: string;
  output?: string;
}

interface MergedConfig {
  reporter: (Reporter | string)[];
  [key: string]: unknown;
}

const SHIM = '../../../src/sauce-testcafe-config.cjs';

// The shim computes its result at require time, so each case loads a fresh copy.
function loadConfig(): MergedConfig {
  let cfg: MergedConfig = { reporter: [] };
  jest.isolateModules(function () {
    cfg = jest.requireActual(SHIM);
  });
  return cfg;
}

function sauceReporters(assets: string): Reporter[] {
  return [
    { name: 'xunit', output: path.join(assets, 'report.xml') },
    { name: 'json', output: path.join(assets, 'report.json') },
    { name: 'saucelabs' },
    { name: 'list' },
  ];
}

describe('sauce-testcafe-config', function () {
  let OLD_ENV: ProcessEnv;
  let tmpDir: string;

  beforeEach(function () {
    OLD_ENV = process.env;
    process.env = { ...OLD_ENV };
    delete process.env.SAUCE_DEBUG;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sauce-tc-config-'));
    process.env.ASSETS_PATH = path.join(tmpDir, 'assets');
  });

  afterEach(function () {
    process.env = OLD_ENV;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  function writeConfig(name: string, content: string): string {
    const file = path.join(tmpDir, name);
    fs.writeFileSync(file, content);
    process.env.TESTCAFE_CFG_FILE = file;
    return file;
  }

  it('uses only the Sauce reporters when no config file exists', function () {
    process.env.TESTCAFE_CFG_FILE = path.join(tmpDir, 'missing.json');

    const cfg = loadConfig();

    expect(cfg.reporter).toEqual(sauceReporters(process.env.ASSETS_PATH!));
    expect(cfg.videoPath).toBeUndefined();
    expect(cfg.videoOptions).toBeUndefined();
    expect(cfg.videoEncodingOptions).toBeUndefined();
  });

  it('defaults the report output folder to __assets__', function () {
    delete process.env.ASSETS_PATH;
    process.env.TESTCAFE_CFG_FILE = path.join(tmpDir, 'missing.json');

    const cfg = loadConfig();

    expect(cfg.reporter).toEqual(sauceReporters('__assets__'));
  });

  it('concatenates user reporter arrays and deep-merges other options', function () {
    writeConfig(
      '.testcaferc.json',
      JSON.stringify({
        reporter: [{ name: 'spec' }, { name: 'html', output: 'out.html' }],
        screenshots: { path: 'shots', takeOnFails: true },
        skipJsErrors: true,
        videoPath: 'videos',
        videoOptions: { singleFile: true },
        videoEncodingOptions: { r: 20 },
      }),
    );

    const cfg = loadConfig();

    expect(cfg.reporter).toEqual([
      { name: 'spec' },
      { name: 'html', output: 'out.html' },
      ...sauceReporters(process.env.ASSETS_PATH!),
    ]);
    expect(cfg.screenshots).toEqual({ path: 'shots', takeOnFails: true });
    expect(cfg.skipJsErrors).toBe(true);
    expect(cfg.videoPath).toBeUndefined();
    expect(cfg.videoOptions).toBeUndefined();
    expect(cfg.videoEncodingOptions).toBeUndefined();
  });

  it('appends a single (non-array) user reporter after the Sauce reporters', function () {
    writeConfig('.testcaferc.json', JSON.stringify({ reporter: 'spec' }));

    const cfg = loadConfig();

    expect(cfg.reporter).toEqual([
      ...sauceReporters(process.env.ASSETS_PATH!),
      'spec',
    ]);
  });

  it('loads a .cjs config and unwraps its default export', function () {
    writeConfig(
      '.testcaferc.cjs',
      "module.exports = { default: { reporter: [{ name: 'spec' }], selectorTimeout: 1234 } };",
    );

    const cfg = loadConfig();

    expect(cfg.selectorTimeout).toBe(1234);
    expect(cfg.default).toBeUndefined();
    expect(cfg.reporter).toEqual([
      { name: 'spec' },
      ...sauceReporters(process.env.ASSETS_PATH!),
    ]);
  });

  it('logs and falls back to defaults when the config file cannot be parsed', function () {
    const file = writeConfig('.testcaferc.json', '{ not json');
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const cfg = loadConfig();

    expect(errorSpy).toHaveBeenCalledWith(
      `failed to read TestCafe config file(${file}):`,
      expect.any(SyntaxError),
    );
    expect(cfg.reporter).toEqual(sauceReporters(process.env.ASSETS_PATH!));
  });

  it('prints debug output when SAUCE_DEBUG is enabled', function () {
    process.env.SAUCE_DEBUG = 'true';
    process.env.TESTCAFE_CFG_FILE = path.join(tmpDir, 'missing.json');
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    loadConfig();

    expect(logSpy).toHaveBeenCalledWith(
      '[sauce-testcafe-config]',
      'Looking for TestCafe config files in:',
      [process.env.TESTCAFE_CFG_FILE],
    );
  });
});
