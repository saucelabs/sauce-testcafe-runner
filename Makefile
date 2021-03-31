DOCKER_IMAGE_NAME := saucelabs/stt-testcafe-node
GHERKIN_DOCKER_IMAGE_NAME := saucelabs/stt-testcafe-gherkin-node

docker:
	#docker build -t $(DOCKER_IMAGE_NAME):latest .
	docker build -t $(GHERKIN_DOCKER_IMAGE_NAME):latest -f Dockerfile.gherkin .