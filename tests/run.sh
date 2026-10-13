#!/usr/bin/env bash

# suite=result
tests=(devxpress-test=success sauceswag-ok=success sauceswag-fail=failure)

for i in "${tests[@]}"; do
    suite=$(echo ${i} | cut -d '=' -f 1)
    expected_result=$(echo ${i} | cut -d '=' -f 2)
    tmpfile=$(mktemp)

    current_suite_folder="./tests/local/$suite"
    assets_folder="$current_suite_folder/__assets__"
    cp ./lib/sauce-testcafe-config.cjs $current_suite_folder
    # The runner never clears __assets__, so stale reports from an earlier run
    # would mask a reporter that stopped writing.
    rm -rf "$assets_folder"

    echo "Running ${suite}:"
    pushd $current_suite_folder > /dev/null
    node ../../../ -r ./sauce-runner.json -s "saucy test" > ${tmpfile} 2>&1
    RETURN_CODE=${?}
    popd > /dev/null

    echo "expected_result: ${expected_result}, exit code: ${RETURN_CODE}"
    if ([ "${expected_result}" == "success" ] && [ "${RETURN_CODE}" -ne 0 ]) ||
         ([ "${expected_result}" == "failure" ] && [ "${RETURN_CODE}" -eq 0 ]);then
        cat ${tmpfile}
        rm -f ${tmpfile}

        echo "TEST FAILURE: Result expected is ${expected_result}, and exitCode is ${RETURN_CODE}"
        exit 1
    fi

    # The reporters configured in sauce-testcafe-config.cjs must write their
    # output for every suite, including the failing one: a test failure still
    # produces reports, only a broken reporter setup or a crash does not.
    for report in report.xml report.json; do
        if [ ! -s "$assets_folder/$report" ]; then
            cat ${tmpfile}
            rm -f ${tmpfile}

            echo "TEST FAILURE: $assets_folder/$report is missing or empty"
            exit 1
        fi
    done
    rm -f ${tmpfile}
    echo ""
done
