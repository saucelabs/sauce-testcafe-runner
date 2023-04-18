set -e
rm -rf ./bundle/
mkdir ./bundle/
cp -r ./src/ ./bundle/src/
cp -r ./bin/ bundle/bin/
cp package.json bundle/package.json
cp package-lock.json bundle/package-lock.json
cp tsconfig.json bundle/tsconfig.json
cp "$(which node)" bundle/

pushd bundle/
npm cache clean --force
npm ci --production
npm run build

# Sanity tests
./node ./node_modules/testcafe/lib/cli/cli.js --version
export SAUCE_VM="truth"
#./node . --runCfgPath ../tests/fixtures/sauceswag-ok/sauce-runner.json --suiteName default
# TODO: Add "saucectl" tests here
popd