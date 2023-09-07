set -e
NODE_VERSION=$(node --version)
NODE_URL="https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-win-x64.zip"
NODE_TAR_FILE="node-$NODE_VERSION-win-x64.zip"
NODE_DIR="node-$NODE_VERSION-win-x64"

rm -rf ./bundle/
mkdir ./bundle/
cp -r ./src/ ./bundle/src/
cp -r ./bin/ bundle/bin/
cp package.json bundle/package.json
cp package-lock.json bundle/package-lock.json
cp tsconfig.json bundle/tsconfig.json
cp "$(which node)" bundle/

cp $(which node) bundle/

curl -o $NODE_TAR_FILE $NODE_URL
unzip $NODE_TAR_FILE
mv $NODE_DIR bundle/node_dir

pushd bundle/
npm cache clean --force
npm ci --production
npm run build

# Sanity tests
./node ./node_modules/testcafe/lib/cli/cli.js --version
popd