DOCKER_IMAGE_NAME := saucelabs/stt-testcafe-node

docker:
	docker build -t $(DOCKER_IMAGE_NAME):latest .