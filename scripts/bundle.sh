set -e
rm -rf ./bundle/
mkdir ./bundle/
cp -r ./src/ ./bundle/src/
cp -r bin/ bundle/bin/
cp package.json bundle/package.json
cp package-lock.json bundle/package-lock.json
cp "$(which node)" bundle/

pushd bundle/
npm cache clean --force
npm ci --production
node ./node_modules/testcafe/lib/cli/cli.js --version
# TODO: Add "saucectl" tests here
popd