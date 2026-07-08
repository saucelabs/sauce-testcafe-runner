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

// SKIPPED (INT-635): saucedemo's successful standard_user login is currently
// unreliable across platforms — with valid credentials filled, clicking submit is a
// no-op (no navigation, no error), while the error-path logins above (username-not-set,
// locked user) pass. Pre-existing (fails identically on testcafe 3.7.4), unrelated to
// the July framework bump. Local success-path coverage is retained by the devxpress-test
// suite. Re-enable once the saucedemo login is made robust — see INT-635.
test.skip('SwagLabs standard user login', async function (t) {
  await t
    .typeText(login.usernameEl, Users.standard)
    .typeText(login.passwordEl, Users.password)
    .click('.btn_action')
    .takeScreenshot()
    // Use the assertion to check if the actual header text is equal to the expected one
    .expect(Selector('#inventory_container').visible)
    .eql(true);
});
