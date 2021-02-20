#!/usr/bin/env bash

## Add Changelog
echo "## Changelog"
git --no-pager log --no-notes --no-decorate --oneline  v${1}...master

## Add Framework version
TESTCAFE_VER=$(< package-lock.json jq -r '.dependencies["testcafe"].version')
NODEJS_VER=$(grep NODE_VERSION= Dockerfile | cut -d '=' -f 2)

echo ""
echo "## Frameworks"
echo "- TestCafe ${TESTCAFE_VER}"
echo "- NodeJS ${NODEJS_VER}"


## Add Browser versions
BASE_IMAGE=$(grep FROM Dockerfile | cut -d ' ' -f 2)
docker pull "${BASE_IMAGE}" > /dev/null 2>&1 || exit 1
FF_VER=$(docker inspect ${BASE_IMAGE} | jq -r '.[0].ContainerConfig.Env | .[] | select(. | startswith("FF_VER="))' | cut -d '=' -f 2)
CHROME_VER=$(docker inspect ${BASE_IMAGE} | jq -r '.[0].ContainerConfig.Env | .[] | select(. | startswith("CHROME_VER="))' | cut -d '=' -f 2)

echo ""
echo "## Browsers"
echo "- Firefox ${FF_VER}"
echo "- Chrome ${CHROME_VER}";