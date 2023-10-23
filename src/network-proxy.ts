import * as shell from "shelljs";
import path from 'path';

const networkSetup = '/usr/sbin/networksetup';

export function isProxyAvailable() {
  const proxy = process.env.HTTP_PROXY;
  return proxy && Array.isArray(proxy.split(':')) && proxy.split(':').length > 2;
}

function getProxySetting() {
  const proxy = process.env.HTTP_PROXY?.split(':') || [];
  if (proxy?.length < 2) {
    return;
  }
  return {
    proxyHost: proxy[1].replaceAll('/', ''),
    proxyPort: proxy[2],
  }
}

function findNetworkServiceOnMac() {
  const networkInfo = shell.exec(`${networkSetup} -listnetworkserviceorder`, {async: false}).stdout;
  const lines = networkInfo.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('Device: en')) {
      // Network service name would be shown like: (1) Wi-Fi.
      // Extract "Wi-Fi" from this line.
      const service = lines[i-1].substring(4);
      const serviceInfo = shell.exec(`${networkSetup} -getinfo "${service}"`, {async: false}).stdout;
      for (const l of serviceInfo.split('\n')) {
        if (l.includes('IP address') && !l.includes('IPv6') && !l.includes('none')) {
          return service;
        }
      }
    }
  }
  return 'Ethernet';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setupMacProxy(proxy: any) {
  const {
    proxyHost,
    proxyPort,
  } = proxy;
  const networkService = findNetworkServiceOnMac();
  shell.exec(`sudo ${networkSetup} -setwebproxy "${networkService}" ${proxyHost} ${proxyPort}`, {async: false});
  shell.exec(`sudo ${networkSetup} -setsecurewebproxy "${networkService}" ${proxyHost} ${proxyPort}`, {async: false});
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setupWinProxy(proxy: any) {
  const {
    proxyHost,
    proxyPort,
  } = proxy; 
  const prefix =
    'reg add "HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ';
  const opts = { async: false };
  shell.exec(`${prefix} MigrateProxy /t REG_DWORD /d 1 /f`, opts)
  shell.exec(`${prefix} ProxyEnable /t REG_DWORD /d 1 /f`, opts)
  shell.exec(`${prefix} ProxyHttp1.1 /t REG_DWORD /d 1 /f`, opts)
  shell.exec(`${prefix} EnableLegacyAutoProxyFeatures /t REG_DWORD /d 1 /f`, opts)
  shell.exec(`${prefix} ProxyServer /t REG_SZ /d "${proxyHost}:${proxyPort}" /f`, opts)
  shell.exec(`${prefix} ProxyOverride /t REG_SZ /d "localhost;127.0.0.1" /f`, opts)

  // Registry changes won't take effect immediately; we need to refresh wininet.
  const refreshScript = path.join(__dirname, '../', 'scripts', 'win-refresh-wininet.ps1');
  shell.exec(`powershell.exe -ExecutionPolicy Bypass ${refreshScript}`, opts);
}

export function setupProxy() {
  const proxy = getProxySetting();
  if (!proxy) {
    return;
  }
  console.log(`Setting system proxy settings: ${proxy.proxyHost}:${proxy.proxyPort}`);
  switch (process.platform) {
    case 'darwin':
      setupMacProxy(proxy);
      break;
    case 'win32':
      setupWinProxy(proxy);
      break;
  }
}