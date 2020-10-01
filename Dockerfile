FROM saucelabs/testrunner-image:v0.1.0

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

COPY package.json .
COPY package-lock.json .
RUN npm i

COPY --chown=seluser:seluser . .

RUN mkdir -p reports
RUN mkdir -p tests

ARG SAUCECTL_VERSION=0.13.0
ENV SAUCECTL_BINARY=saucectl_${SAUCECTL_VERSION}_linux_64-bit.tar.gz

RUN curl -L -o ${SAUCECTL_BINARY} \
  -H "Accept: application/octet-stream" \
  https://github.com/saucelabs/saucectl/releases/download/v${SAUCECTL_VERSION}/${SAUCECTL_BINARY} \
  && tar -xvzf ${SAUCECTL_BINARY} \
  && mkdir /home/seluser/bin/ \
  && mv ./saucectl /home/seluser/bin/saucectl \
  && rm ${SAUCECTL_BINARY}

# Workaround for permissions in CI if run with a different user
RUN chmod 777 -R /home/seluser/

CMD ["./entry.sh"]
