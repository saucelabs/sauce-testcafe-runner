jest.mock('testcafe');
jest.mock('sauce-testrunner-utils');
jest.mock('../../../src/sauce-testreporter');
const { buildCommandLine } = require('../../../src/testcafe-runner');


describe('buildCommandLine', function () {
  it('most basic config', function () {
    const cli = buildCommandLine({
      browserName: 'firefox',
      src: ['**/*.test.js'],
    }, '/fake/project/path', '/fake/assets/path');
    expect(cli).toMatchObject([
      'firefox:headless:marionettePort=9223',
      '**/*.test.js',
      '--video',
      '--video-options singleFile=true,failedOnly=false,pathPattern=video.mp4',
      '--reporter',
      'xunit:/fake/assets/path/report.xml,json:/fake/assets/path/report.json,list',
    ]);
  });
  it('basic with filters', function () {
    const cli = buildCommandLine({
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
      }
    }, '/fake/project/path', '/fake/assets/path');
    expect(cli).toMatchObject([
      'firefox:headless:marionettePort=9223',
      '**/*.test.js',
      '--video',
      '--video-options singleFile=true,failedOnly=false,pathPattern=video.mp4',
      '--test', 'fixed-test-name',
      '--fixture', 'fixed-fixture-name',
      '--test-grep', '.*test-name.*',
      '--fixture-grep', '.*fixture-name.*',
      '--test-meta', 'my-key=my-val,2nd-key=2nd-val',
      '--fixture-meta', 'my-key=my-val,2nd-key=2nd-val',
      '--reporter',
      'xunit:/fake/assets/path/report.xml,json:/fake/assets/path/report.json,list',
    ]);
  });
  // it('basic with proxy', function () {
  //   process.env.HTTP_PROXY = 'http://my-proxy.com:8080';

  //   const cli = buildCommandLine({
  //     browserName: 'firefox',
  //     src: ['**/*.test.js'],
  //   }, '/fake/project/path', '/fake/assets/path');
  //   expect(cli).toMatchObject([
  //     'firefox:headless:marionettePort=9223',
  //     '**/*.test.js',
  //     '--video',
  //     '--video-options singleFile=true,failedOnly=false,pathPattern=video.mp4',
  //     '--proxy', 'http://my-proxy.com:8080/',
  //     '--reporter',
  //     'xunit:/fake/assets/path/report.xml,json:/fake/assets/path/report.json,list',
  //   ]);
  //   process.env.HTTP_PROXY = undefined;
  // });
  it('basic with screenshots', function () {
    const cli = buildCommandLine({
      browserName: 'firefox',
      src: ['**/*.test.js'],
      screenshots: {
        fullPage: true,
        takeOnFails: true,
      },
    }, '/fake/project/path', '/fake/assets/path');
    expect(cli).toMatchObject([
      'firefox:headless:marionettePort=9223',
      '**/*.test.js',
      '--video',
      '--video-options singleFile=true,failedOnly=false,pathPattern=video.mp4',
      '--screenshots', 'takeOnFails=true,fullPage=true,path=/fake/assets/path,pathPattern=${FIXTURE}__${TEST}__screenshot-${FILE_INDEX}',
      '--reporter',
      'xunit:/fake/assets/path/report.xml,json:/fake/assets/path/report.json,list',
    ]);
  });
  it('basic with quarantineMode', function () {
    const cli = buildCommandLine({
      browserName: 'firefox',
      src: ['**/*.test.js'],
      quarantineMode: {
        attemptLimit: 10,
        successThreshold: 3,
      },
    }, '/fake/project/path', '/fake/assets/path');
    expect(cli).toMatchObject([
      'firefox:headless:marionettePort=9223',
      '**/*.test.js',
      '--quarantine-mode', 'attemptLimit=10,successThreshold=3',
      '--video',
      '--video-options singleFile=true,failedOnly=false,pathPattern=video.mp4',
      '--reporter',
      'xunit:/fake/assets/path/report.xml,json:/fake/assets/path/report.json,list',
    ]);
  });
  it('basic with different flags', function () {
    const cli = buildCommandLine({
      browserName: 'firefox',
      src: ['**/*.test.js'],
      skipJsErrors: true,
      skipUncaughtErrors: true,
      selectorTimeout: 1000,
      assertionTimeout: 1000,
      pageLoadTimeout: 1000,
      speed: 0.5,
      stopOnFirstFail: true,
      disablePageCaching: true,
      disableScreenshots: true,
    }, '/fake/project/path', '/fake/assets/path');
    expect(cli).toMatchObject([
      'firefox:headless:marionettePort=9223',
      '**/*.test.js',
      '--skip-js-errors',
      '--skip-uncaught-errors',
      '--selector-timeout', 1000,
      '--assertion-timeout', 1000,
      '--page-load-timeout', 1000,
      '--speed', 0.5,
      '--stop-on-first-fail',
      '--disable-page-caching',
      '--disable-screenshots',
      '--video',
      '--video-options singleFile=true,failedOnly=false,pathPattern=video.mp4',
      '--reporter',
      'xunit:/fake/assets/path/report.xml,json:/fake/assets/path/report.json,list',
    ]);
  });
  it('basic with client scripts', function () {
    const cli = buildCommandLine({
      browserName: 'firefox',
      src: ['**/*.test.js'],
      clientScripts: [
        'script.js',
      ],
    }, '/fake/project/path', '/fake/assets/path');
    expect(cli).toMatchObject([
      'firefox:headless:marionettePort=9223',
      '**/*.test.js',
      '--client-scripts', '/fake/project/path/script.js',
      '--video',
      '--video-options singleFile=true,failedOnly=false,pathPattern=video.mp4',
      '--reporter',
      'xunit:/fake/assets/path/report.xml,json:/fake/assets/path/report.json,list',
    ]);
  });
  it('basic with tsConfigPath', function () {
    const cli = buildCommandLine({
      browserName: 'firefox',
      src: ['**/*.test.js'],
      tsConfigPath: 'tsconfig.json',
    }, '/fake/project/path', '/fake/assets/path');
    expect(cli).toMatchObject([
      'firefox:headless:marionettePort=9223',
      '**/*.test.js',
      '--ts-config-path', 'tsconfig.json',
      '--video',
      '--video-options singleFile=true,failedOnly=false,pathPattern=video.mp4',
      '--reporter',
      'xunit:/fake/assets/path/report.xml,json:/fake/assets/path/report.json,list',
    ]);
  });
  it('basic with no-array src', function () {
    const cli = buildCommandLine({
      browserName: 'firefox',
      src: '**/*.test.js',
    }, '/fake/project/path', '/fake/assets/path');
    expect(cli).toMatchObject([
      'firefox:headless:marionettePort=9223',
      '**/*.test.js',
      '--video',
      '--video-options singleFile=true,failedOnly=false,pathPattern=video.mp4',
      '--reporter',
      'xunit:/fake/assets/path/report.xml,json:/fake/assets/path/report.json,list',
    ]);
  });
  it('basic with browserArgs', function () {
    const cli = buildCommandLine({
      browserName: 'firefox',
      src: '**/*.test.js',
      browserArgs: ['--chrome-fake-param'],
    }, '/fake/project/path', '/fake/assets/path');
    expect(cli).toMatchObject([
      'firefox:headless:marionettePort=9223 --chrome-fake-param',
      '**/*.test.js',
      '--video',
      '--video-options singleFile=true,failedOnly=false,pathPattern=video.mp4',
      '--reporter',
      'xunit:/fake/assets/path/report.xml,json:/fake/assets/path/report.json,list',
    ]);
  });
  it('basic with invalid browser', function () {
    const t = () => {
      buildCommandLine({
        browserName: 'invalid',
        src: '**/*.test.js',
      }, '/fake/project/path', '/fake/assets/path');
    };
    expect(t).toThrow('Unsupported browser: invalid.');
  });
  describe('with env + inside VM', function () {
    const OLD_ENV = process.env;

    afterAll(function () {
      process.env = OLD_ENV;
    });

    it('should use http_proxy', function () {
      process.env.SAUCE_VM = 'truthy';
      process.env.SAUCE_VIDEO_RECORD = 'truthy';
      process.env.SAUCE_BROWSER_PATH = 'D:\\chrome99\\chrome.exe';
      process.env.HTTP_PROXY = 'http://localhost:8080';
      const cli = buildCommandLine({
        browserName: 'firefox',
        src: '**/*.test.js',
      }, '/fake/project/path', '/fake/assets/path');
      expect(cli).toMatchObject([
        'D:\\chrome99\\chrome.exe',
        '**/*.test.js',
        '--video',
        '--video-options singleFile=true,failedOnly=false,pathPattern=video.mp4',
        '--proxy', 'http://localhost:8080',
        '--reporter',
        'xunit:/fake/assets/path/report.xml,json:/fake/assets/path/report.json,list',
      ]);
    });
  });
});
