FROM node:22-alpine

WORKDIR /app

ARG TRAVEL_BUILD_COMMIT=unknown
ARG TRAVEL_BUILD_MESSAGE=unknown
ARG TRAVEL_BUILD_COMMIT_TIME=unknown
ARG TRAVEL_BUILD_TIME=unknown

ENV NODE_ENV=production \
    TRAVEL_BUILD_COMMIT=$TRAVEL_BUILD_COMMIT \
    TRAVEL_BUILD_MESSAGE=$TRAVEL_BUILD_MESSAGE \
    TRAVEL_BUILD_COMMIT_TIME=$TRAVEL_BUILD_COMMIT_TIME \
    TRAVEL_BUILD_TIME=$TRAVEL_BUILD_TIME

LABEL org.opencontainers.image.revision=$TRAVEL_BUILD_COMMIT

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

COPY src ./src
COPY public ./public

USER node
EXPOSE 8080
CMD ["node", "src/server.js"]
