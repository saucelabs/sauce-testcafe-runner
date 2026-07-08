import { Selector, fixture, test } from 'testcafe';

fixture('Getting Started Sauce demo').page('https://www.saucedemo.com/');

const Users = {
  password: 'secret_sauce',
  standard: 'standard_user',
  locked: 'locked_out_user',
};

class Login {
  constructor() {
    this.usernameEl = Selector('#user-name');
    this.passwordEl = Selector('#password');
  }
}

const login = new Login();

test('SwagLabs username not set', async function (t) {
  await t
    .click('.btn_action')
    // Use the assertion to check if the actual header text is equal to the expected one
    .expect(Selector('h3, [data-test=error]').innerText)
    .contains('Username is required')
    .expect(Selector('.error-button').visible)
    .eql(true);
});

test('SwagLabs locked user login', async function (t) {
  await t
    .typeText(login.usernameEl, Users.locked)
    .typeText(login.passwordEl, Users.password)
    .click('.btn_action')
    // Use the assertion to check if the actual header text is equal to the expected one
    .expect(Selector('h3, [data-test=error]').innerText)
    .contains('Sorry')
    .expect(Selector('.error-button').visible)
    .eql(true);
});

test('SwagLabs standard user login', async function (t) {
  // saucedemo intermittently no-ops the login submit when it is hit repeatedly
  // within one browser session (an isolated login always works). Retry the full
  // login — reload, refill (paste), submit — until the inventory page appears,
  // with a small backoff between attempts. See INT-634.
  let loggedIn = false;
  for (let attempt = 1; attempt <= 3 && !loggedIn; attempt++) {
    if (attempt > 1) {
      await t.navigateTo('https://www.saucedemo.com/').wait(2000 * attempt);
    }
    await t
      .typeText(login.usernameEl, Users.standard, {
        replace: true,
        paste: true,
      })
      .typeText(login.passwordEl, Users.password, {
        replace: true,
        paste: true,
      })
      .click('.btn_action');
    loggedIn = await Selector('#inventory_container').with({ timeout: 10000 })
      .exists;
  }
  await t.expect(Selector('#inventory_container').visible).eql(true);
});
