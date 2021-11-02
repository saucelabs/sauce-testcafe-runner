import { Selector } from 'testcafe';

fixture `Sauce-Connect`.page `http://127.0.0.1:8000/`;

test('Checking sauce-connect connectivity', async function (t) {
  await t.expect(Selector('title').innerText).eql('Simple Page');
});
