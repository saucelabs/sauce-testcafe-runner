set -e
rm -rf ./bundle/
mkdir ./bundle/
mkdir -p ./bundle/scripts
cp -r ./src/ ./bundle/src/
cp package.json bundle/package.json
cp package-lock.json bundle/package-lock.json
cp tsconfig.json bundle/tsconfig.json
cp "$(which node)" bundle/
cp ./scripts/win-refresh-wininet.ps1 bundle/scripts/win-refresh-wininet.ps1
cp -r ./patches/ ./bundle/patches/

pushd bundle/
npm cache clean --force
npm ci --production
# Fail the bundle if patch-package skipped or failed to apply the patch.
grep -q "SAUCE PATCH" node_modules/testcafe-browser-tools/lib/api/get-installations.js \
  || { echo "testcafe-browser-tools patch not applied"; exit 1; }
npm run build

# Sanity tests
./node ./node_modules/testcafe/lib/cli/cli.js --version
popd