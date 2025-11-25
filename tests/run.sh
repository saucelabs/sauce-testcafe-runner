#!/usr/bin/env bash

: '
# suite=result
tests=(devxpress-test=success sauceswag-ok=success sauceswag-fail=failure)

for i in "${tests[@]}"; do
    suite=$(echo ${i} | cut -d '=' -f 1)
    expected_result=$(echo ${i} | cut -d '=' -f 2)
    tmpfile=$(mktemp)

    current_suite_folder="./tests/local/$suite"
    cp ./lib/sauce-testcafe-config.cjs $current_suite_folder

    echo "Running ${suite}:"
    pushd $current_suite_folder > /dev/null
    node ../../../ -r ./sauce-runner.json -s "saucy test" > ${tmpfile} 2>&1
    RETURN_CODE=${?}
    popd > /dev/null

    echo "expected_result: ${RETURN_CODE}"
    if ([ "${expected_result}" == "success" ] && [ "${RETURN_CODE}" -ne 0 ]) ||
         ([ "${expected_result}" == "failure" ] && [ "${RETURN_CODE}" -eq 0 ]);then
        cat ${tmpfile}
        rm -f ${tmpfile}

        echo "TEST FAILURE: Result expected is ${expected_result}, and exitCode is ${RETURN_CODE}"
        exit 1
    fi
    rm -f ${tmpfile}
    echo ""
done
'
