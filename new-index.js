const util = require('util');
const exec = util.promisify(require('child_process').exec);
const debug = require('debug')('testcafe:browser-provider-ios');
const deviceList = require('./device_list.js');
const idbCompanion = require('./idb_companion.js');
const process = require('process');

module.exports = {
  // Multiple browsers support
  isMultiBrowser: true,

  currentBrowsers: {},

  availableDevices: [],

  _browserNameToDevice(browserName) {
    const [device, version = 'any'] = browserName.split(':');

    return deviceList.find(this.availableDevices, {
      name: device,
      platform: version,
    });
  },

  async openBrowser(id, pageUrl, browserName) {
    debug(`Opening ${browserName}`);
    var device = this._browserNameToDevice(browserName);

    if (device === null)
      throw new Error('Could not find a valid iOS device to test on');

    this.currentBrowsers[id] = device;

    // If the device is not Shutdown we will try to use it.
    if (device.state !== 'Shutdown') {
      debug('Device already booted');
      //await idbCompanion.shutdown(device.udid);
    } else {
      debug(`Booting device (${device.name} ${device.os} ${device.version})`);
      // Timeout in seconds
      const timeout = process.env.IOS_BOOT_TIMEOUT || 60;
      await idbCompanion.boot(device.udid, timeout * 1000);
    }

    debug(`Opening url: ${pageUrl}`);
    await exec(`xcrun simctl openurl ${device.udid} ${pageUrl}`, {
      stdio: 'ignore',
    });
  },

  async closeBrowser(id) {
    const skipShutdown = process.env.IOS_SKIP_SHUTDOWN || '';

    if (skipShutdown !== '') return;

    await idbCompanion.shutdown(this.currentBrowsers[id].udid);
  },

  // Optional - implement methods you need, remove other methods
  async init() {
    debug('Initializing plugin');
    var rawDevices = await idbCompanion.list();

    this.availableDevices = deviceList.parse(rawDevices);
    debug(`Found ${this.availableDevices.length} devices`);
  },

  async getBrowserList() {
    return this.availableDevices.map(
      (device) => `${device.name}:${device.os} ${device.version}`,
    );
  },

  async isValidBrowserName(browserName) {
    return this._browserNameToDevice(browserName) !== null;
  },

  async resizeWindow(/* id, width, height, currentWidth, currentHeight */) {
    this.reportWarning(
      'The window resize functionality is not supported by the "ios" browser provider.',
    );
  },

  async takeScreenshot(id, screenshotPath) {
    var command = `xcrun simctl io ${this.currentBrowsers[id].udid} screenshot '${screenshotPath}'`;

    await exec(command, { stdio: 'ignore' });
  },
};
