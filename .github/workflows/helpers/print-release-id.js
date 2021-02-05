
const { get } = require('https');

/**
 * Get the release associated with a tag and print the release ID to console
 * @param {string} tag 
 */
const printReleaseId = (repo, tag) => new Promise(async (resolve) => {
  const apiEndpoint = `https://api.github.com/repos/saucelabs/${repo}/releases/tags/${tag}`;
  console.log(`Hitting endpoint: '${apiEndpoint}'`)
  get(apiEndpoint, {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'ReleaseId Fetcher',
    }
  }, (res) => {
    let body = '';
    res.on('data', (chunk) => {
      body += chunk;
    });
    res.on('end', () => {
      body = JSON.parse(body);
      console.log(body.id);
      resolve();
    });
  });
});

if (require.main === module) {
  let repo = process.env.GH_REPO;
  let ref = process.env.GH_REF;
  let [,type,tag] = ref.split('/');
  if (!['tag', 'tags'].includes(type)) {
    tag = 'v0.1.9'; // <-- for testing purposes
  }
  printReleaseId(repo, tag)
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}