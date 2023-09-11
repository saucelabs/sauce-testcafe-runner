#!/usr/bin/env bash

# SAUCECTL=$(realpath ${SAUCE_CTL_BINARY})
# suite=result
tests=(devxpress-test=success sauceswag-ok=success sauceswag-fail=failure)

for i in ${tests[@]}; do
    key=$(echo ${i} | cut -d '=' -f 1)
    result=$(echo ${i} | cut -d '=' -f 2)
    tmpfile=$(mktemp)
    echo $key
    target_folder="./tests/local/$key"
    cp ./lib/sauce-testcafe-config.js $target_folder

    echo "Running ${key}:"
    pushd $target_folder > /dev/null
    node ../../../ -r ./sauce-runner.json -s "saucy test" > ${tmpfile} 2>&1
    RETURN_CODE=${?}
    popd > /dev/null

    echo "Result: ${RETURN_CODE}"
    if ([ "${result}" == "success" ] && [ "${RETURN_CODE}" -ne 0 ]) ||
         ([ "${result}" == "failure" ] && [ "${RETURN_CODE}" -eq 0 ]);then
        cat ${tmpfile}
        rm -f ${tmpfile}

        echo "TEST FAILURE: Result expected is ${result}, and exitCode is ${RETURN_CODE}"
        exit 1
    fi
    rm -f ${tmpfile}
    echo ""
done
