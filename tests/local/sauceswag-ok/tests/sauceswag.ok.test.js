import { Selector, ClientFunction, fixture, test } from 'testcafe';

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

// TEMPORARY CI DIAGNOSTIC (INT-634): fill creds, submit, then log the resulting
// page state to stdout AND embed it in the assertion message, so the CI log shows
// what the runner's browser actually gets post-login. Revert once diagnosed.
const pageState = ClientFunction(() =>
  JSON.stringify({
    url: location.href,
    title: document.title,
    h3: (document.querySelector('h3') || {}).textContent || null,
    err:
      (document.querySelector('[data-test="error"]') || {}).textContent || null,
    invExists: !!document.querySelector('#inventory_container'),
    stillLogin: !!document.querySelector('#user-name'),
    userVal: (document.querySelector('#user-name') || {}).value,
    cookie: document.cookie,
    body: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 300),
  }),
);

test('SwagLabs standard user login', async function (t) {
  await t
    .typeText(login.usernameEl, Users.standard, { replace: true, paste: true })
    .typeText(login.passwordEl, Users.password, { replace: true, paste: true });
  console.log('DIAG-CI preclick ' + (await pageState()));
  await t.click('.btn_action').wait(6000);
  const state = await pageState();
  console.log('DIAG-CI postclick ' + state);
  await t
    .expect(Selector('#inventory_container').visible)
    .eql(true, 'DIAG-CI ' + state);
});
