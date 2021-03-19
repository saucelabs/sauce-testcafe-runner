const https = require('https');

const args = process.argv.slice(2);

const url = process.env.SLACK_WEBHOOK_URL;
const workflowName = process.env.WORKFLOW_NAME || args[0];
const jobName = process.env.JOB_NAME || args[1];
const runLink = process.env.RUN_LINK || args[2];
const runNumber = process.env.RUN_NUMBER || args[3];
const releaseName = process.env.RELEASE_NAME || args[4];
const releaseLink = process.env.RELEASE_LINK || args[5];
const commitSha = process.env.COMMIT_SHA || args[6];
const commitLink = process.env.COMMIT_LINK || args[7];

const data = JSON.stringify({
  attachments: [{
    mrkdwn_in: ['text'],
    color: 'danger',
    title: args[0],
    text: `${jobName} job *failed*   :homer_back_away:`,
    fields: [
      {
        title: 'Release',
        value: `<${releaseLink}|${releaseName}>`,
        short: true
      },
      {
        title: 'Commit',
        value: `<${commitLink}|${commitSha.substring(0, 7)}>`,
        short: true
      },
      {
        title: 'Run',
        value: `<${runLink}|${workflowName}#${runNumber}>`,
        short: true
      },
    ]
  }]
});


const options = {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = https.request(url, options, (res) => {
  if (res.statusCode !== 200) {
    console.error(`POST to slack failed with status ${res.statusCode} and error ${res.statusMessage}`);
  }
});

req.on('error', (error) => {
  console.error(error);
});

req.write(data);
req.end();
