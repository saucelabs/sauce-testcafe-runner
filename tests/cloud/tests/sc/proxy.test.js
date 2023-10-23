import { Selector, fixture, test } from 'testcafe';

fixture `Sauce-Connect-Proxy`.page `https://artifactory.tools.saucelabs.net/ui/packages`;

test('Checking sauce-connect connectivity', async function(t) {
  await t.expect(Selector('title').innerText).eql('JFrog');
});

