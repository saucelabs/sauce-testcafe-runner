#!/usr/bin/env bash

## Gather Changelog
CHANGELOG=$(git --no-pager log --no-notes --no-decorate --oneline  v${1}...HEAD)

## Gather Framework version
TESTCAFE_VER=$(< package-lock.json jq -r '.dependencies["testcafe"].version')
NODEJS_VER=$(cat .nvmrc | tr -d "v")

## Generate everything
cat <<EOF

## Changelog
${CHANGELOG}

## Frameworks
- TestCafe ${TESTCAFE_VER}
- NodeJS ${NODEJS_VER}

### Build Info
<details>

- jobId: ${GITHUB_RUN_ID}
- branch: ${GITHUB_REF}

</details>
EOF
