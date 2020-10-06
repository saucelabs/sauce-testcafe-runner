set -e
rm -rf ./bundle/
mkdir ./bundle/
cp -r ./src/ ./bundle/src/
cp -r bin/ bundle/bin/
cp package.json bundle/package.json
cp package-lock.json bundle/package-lock.json
cp config.yaml bundle/config.yaml
cp cypress.json bundle/cypress.json
cp "$(which node)" bundle/

pushd bundle/
npm cache clean --force
npm ci --production
./node ./node_modules/cypress/bin/cypress verify
# TODO: Add "saucectl" tests here
popd