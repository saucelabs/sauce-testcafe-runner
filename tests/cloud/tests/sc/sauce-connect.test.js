import { Selector } from 'testcafe';

fixture `Sauce-Connect`.page `http://localhost:8000/index.html`;

test('Checking sauce-connect connectivity', async function (t) {
  await t.expect(Selector('title').innerText).eql('Simple Page');
});
