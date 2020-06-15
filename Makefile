TESTCAFE_VERSION=1.8.5
SAUCECTL_VERSION=0.6.2

build_testrunner_container:
	docker build -f Dockerfile \
		--build-arg SAUCECTL_VERSION=${SAUCECTL_VERSION} \
		-t saucelabs/sauce-testcafe:${TESTCAFE_VERSION}-saucectl${SAUCECTL_VERSION} .\
		${NO_CACHE}

push_testrunner_container:
	docker push ${DOCKER_REGISTRY}saucelabs/sauce-testcafe:${TESTCAFE_VERSION}-saucectl${SAUCECTL_VERSION}
	