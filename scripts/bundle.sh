set -e
rm -rf ./bundle/
mkdir ./bundle/
cp -r ./src/ ./bundle/src/
cp -r ./bin/ bundle/bin/
cp package.json bundle/package.json
cp package-lock.json bundle/package-lock.json
cp testcafe-reporter-saucelabs-1.0.0.tgz bundle/testcafe-reporter-saucelabs-1.0.0.tgz
cp "$(which node)" bundle/

pushd bundle/
npm cache clean --force
npm ci --production --legacy-peer-deps

# Sanity tests
./node ./node_modules/testcafe/lib/cli/cli.js --version
export SAUCE_VM="truth"
#./node . --runCfgPath ../tests/fixtures/sauceswag-ok/sauce-runner.json --suiteName default
# TODO: Add "saucectl" tests here
popd