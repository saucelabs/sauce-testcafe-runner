// Exercises patches/testcafe-browser-tools+*.patch (INT-154): Windows browser
// discovery must survive failing PowerShell registry queries instead of
// aborting TestCafe. Guards against a dependency bump where the patch still
// applies but no longer covers every query.
const mockExecPowershell = jest.fn();
jest.mock('os-family', () => ({ win: true, linux: false, mac: false }));
jest.mock('testcafe-browser-tools/lib/utils/exec', () => ({
  __esModule: true,
  exec: jest.fn(),
  execFile: jest.fn(),
  execPowershell: (...args: unknown[]) => mockExecPowershell(...args),
}));
jest.mock('testcafe-browser-tools/lib/utils/fs-exists-promised', () => ({
  __esModule: true,
  default: async () => true,
}));

const REGISTRY_WARNING = 'TESTCAFE_BROWSER_TOOLS_REGISTRY_WARNING';
const CHROME_PATH =
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CHROME_REGISTRY_BLOCK =
  `(default) : "${CHROME_PATH}"\r\n` +
  'PSPath    : Microsoft.PowerShell.Core\\Registry::HKEY_LOCAL_MACHINE\\Software\\Clients\\StartMenuInternet\\Google Chrome\\shell\\open\\command\r\n\r\n';

function powershellError(stdout = '', stderr = '') {
  return Object.assign(new Error('Command failed with exit code 2'), {
    exitCode: 2,
    stdout,
    stderr,
  });
}

type Installations = Record<string, { path: string }>;

function getInstallations(): Promise<Installations> {
  // Fresh module per test (see resetModules): the result is cached at module level.
  const mod = require('testcafe-browser-tools/lib/api/get-installations');
  return mod.default();
}

describe('patched testcafe-browser-tools browser discovery', function () {
  let stderrWrite: jest.SpyInstance;

  beforeEach(function () {
    jest.resetModules();
    mockExecPowershell.mockReset();
    stderrWrite = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
  });
  afterEach(function () {
    stderrWrite.mockRestore();
  });

  function registryWarnings() {
    return stderrWrite.mock.calls
      .map(([line]) => String(line))
      .filter((line) => line.startsWith(REGISTRY_WARNING));
  }

  it('returns no browsers instead of throwing when every query fails', async function () {
    mockExecPowershell.mockRejectedValue(powershellError());

    await expect(getInstallations()).resolves.toEqual({});
    expect(mockExecPowershell).toHaveBeenCalledTimes(3);
    const warnings = registryWarnings();
    expect(warnings).toHaveLength(3);
    expect(warnings.join('')).toContain('edge-legacy query exited with code 2');
    expect(warnings.join('')).toContain('stderr: (empty)');
  });

  it('keeps the browsers listed in partial output from a failed query', async function () {
    mockExecPowershell.mockImplementation(async (command: string) => {
      if (command.includes('HKEY_LOCAL_MACHINE')) {
        throw powershellError(CHROME_REGISTRY_BLOCK, 'some registry error');
      }
      return { stdout: '' };
    });

    const installations = await getInstallations();
    expect(installations.chrome.path).toBe(CHROME_PATH);
    expect(registryWarnings()).toEqual([
      expect.stringContaining(
        'HKEY_LOCAL_MACHINE browser query exited with code 2; continuing with partial results. stderr: some registry error',
      ),
    ]);
  });
});
