set -e
rm -rf ./bundle/
mkdir ./bundle/
mkdir -p ./bundle/scripts
cp -r ./src/ ./bundle/src/
cp -r ./bin/ bundle/bin/
cp package.json bundle/package.json
cp package-lock.json bundle/package-lock.json
cp tsconfig.json bundle/tsconfig.json
cp "$(which node)" bundle/
cp ./scripts/win-refresh-wininet.ps1 bundle/scripts/win-refresh-wininet.ps1

pushd bundle/
npm cache clean --force
npm ci --production
npm run build

# Sanity tests
./node ./node_modules/testcafe/lib/cli/cli.js --version
popd