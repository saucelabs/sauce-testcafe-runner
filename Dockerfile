FROM saucelabs/testrunner-image:v0.2.0

WORKDIR /home/seluser

USER seluser

#================
# Install Node.JS
#================
ENV NODE_VERSION=12.16.2
ENV NVM_VERSION=0.35.3
RUN wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v${NVM_VERSION}/install.sh | bash \
  && export NVM_DIR="$([ -z "${XDG_CONFIG_HOME-}" ] && printf %s "${HOME}/.nvm" || printf %s "${XDG_CONFIG_HOME}/nvm")" \
  && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" \
  && nvm install ${NODE_VERSION}

ENV PATH="/home/seluser/bin:/home/seluser/.nvm/versions/node/v${NODE_VERSION}/bin:${PATH}"

ENV TESTCAFE_VERSION=1.14.2

COPY package.json .
COPY package-lock.json .
RUN npm ci --production

COPY --chown=seluser:seluser . .

RUN mkdir -p reports
RUN mkdir -p tests

# Workaround for permissions in CI if run with a different user

ENV IMAGE_NAME=saucelabs/stt-testcafe-node
ARG BUILD_TAG
ENV IMAGE_TAG=${BUILD_TAG}


# Let saucectl know where to mount files
RUN mkdir -p /home/seluser/__project__/ && chown seluser:seluser /home/seluser/__project__/
LABEL com.saucelabs.project-dir=/home/seluser/__project__/
ENV SAUCE_PROJECT_DIR=/home/seluser/__project__/

# Let saucectl know what command to execute
LABEL com.saucelabs.entrypoint=/home/seluser/bin/testcafe

# Let saucectl know where to read job details url
LABEL com.saucelabs.job-info=/tmp/output.json
RUN echo "{}" > /tmp/output.json

CMD ["./entry.sh"]
