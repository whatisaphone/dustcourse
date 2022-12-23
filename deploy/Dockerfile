# The app will only run with Node 10, but pnpm requires a newer version, so we
# need do some version juggling until that's fixed.
FROM node:18 AS builder

RUN npm install -g pnpm@7

WORKDIR /opt/dustcourse
COPY package.json pnpm-lock.yaml .
RUN pnpm install --prod --frozen-lockfile

FROM node:10

WORKDIR /opt/dustcourse
COPY --from=builder /opt/dustcourse/node_modules node_modules
COPY build/website/*.js .
COPY build/website/js js
COPY build/website/static static
COPY build/website/views views

EXPOSE 3000
CMD ["node", "."]
