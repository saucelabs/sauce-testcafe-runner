FROM saucelabs/testrunner-image:v0.1.1

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

ENV TESTCAFE_VERSION=1.8.5

COPY package.json .
COPY package-lock.json .
RUN npm i

COPY --chown=seluser:seluser . .

RUN mkdir -p reports
RUN mkdir -p tests

# Workaround for permissions in CI if run with a different user
RUN chmod 777 -R /home/seluser/

CMD ["./entry.sh"]
