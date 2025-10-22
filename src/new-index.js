const util = require('util');
const exec = util.promisify(require('child_process').exec);
const debug = require('debug')('testcafe:browser-provider-ios');
const deviceList = require('./device_list.js');
const idbCompanion = require('./idb_companion.js');
const process = require('process');

/**
 * A utility function to introduce a delay.
 * @param ms - The delay in milliseconds.
 */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    const device = this._browserNameToDevice(browserName);

    if (device === null)
      throw new Error('Could not find a valid iOS device to test on');

    this.currentBrowsers[id] = device;

    // If the device is not Shutdown we don't know what state it's in - shut it down and reboot it
    if (device.state !== 'Shutdown') {
      debug('Forcing shutdown of device before test');
      await idbCompanion.shutdown(device.udid);
    }

    debug(`Booting device (${device.name} ${device.os} ${device.version})`);
    // Timeout in seconds
    const timeout = process.env.IOS_BOOT_TIMEOUT || 60;
    await idbCompanion.boot(device.udid, timeout * 1000);

    const maxRetries = 1;
    const retryDelay = 2000;
    let attempt = 0;

    while (attempt < maxRetries) {
      attempt++;

      try {
        // Try opening the URL on the device by udid
        await exec(`xcrun simctl openurl ${device.udid} ${pageUrl}`);
        return; // Success, exit function.
      } catch (error) {
        debug(`Error opening URL: ${error}`);
        if (attempt >= maxRetries) {
          throw new Error(
            `Failed to open URL on simulator after ${maxRetries} attempts. Last error: ${error instanceof Error ? error.message : String(error)}`,
          );
        }

        // Start recovery process
        try {
          // Use idbCompanion for consistency with the rest of the file
          await idbCompanion.shutdown(device.udid);
          await idbCompanion.boot(device.udid, timeout * 1000);
        } catch (recoveryError) {
          debug(`Recovery error: ${recoveryError}`);
          throw new Error(
            `Simulator recovery failed. Aborting operation. Error: ${recoveryError instanceof Error ? recoveryError.message : String(recoveryError)}`,
          );
        }

        await delay(retryDelay);
      }
    }
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
