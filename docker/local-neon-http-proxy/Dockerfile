# hadolint global ignore=DL3008

ARG NEON_RELEASE_TAG=release-proxy-8853

FROM rust:bookworm AS rust-builder
ARG NEON_RELEASE_TAG

ARG DEBIAN_FRONTEND=noninteractive
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# install apt dependencies
RUN \
  apt-get update -qq \
  && apt-get install -qq -y --no-install-recommends -o DPkg::Options::=--force-confold -o DPkg::Options::=--force-confdef \
  build-essential \
  pkg-config \
  git \
  libssl-dev \
  && apt-get clean -qq && rm -rf /var/lib/apt/lists/*

# get and build the proxy
RUN git clone --depth=1 --branch $NEON_RELEASE_TAG https://github.com/neondatabase/neon.git
WORKDIR /neon
RUN cargo build --bin proxy --features "testing"


FROM debian:bookworm-slim

ARG DEBIAN_FRONTEND=noninteractive
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# install apt dependencies
RUN \
  apt-get update -qq \
  && apt-get install -qq -y --no-install-recommends -o DPkg::Options::=--force-confold -o DPkg::Options::=--force-confdef \
  curl \
  ca-certificates \
  openssl \
  postgresql-client \
  && apt-get clean -qq && rm -rf /var/lib/apt/lists/*

# install caddy
RUN \
  apt-get update -qq \
  && apt-get install -qq -y --no-install-recommends -o DPkg::Options::=--force-confold -o DPkg::Options::=--force-confdef \
  gnupg2 debian-keyring debian-archive-keyring apt-transport-https \
  && curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg2 --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg \
  && curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list \
  && apt-get update -qq \
  && apt-get install -qq -y --no-install-recommends -o DPkg::Options::=--force-confold -o DPkg::Options::=--force-confdef \
  caddy \
  && apt-get clean -qq && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# create a self-signed cert for *.localtest.me (see https://readme.localtest.me/)
RUN openssl req -new -x509 \
  -days 365 \
  -nodes -text \
  -out server.pem \
  -keyout server.key \
  -subj "/CN=*.localtest.me" \
  -addext "subjectAltName = DNS:*.localtest.me"

# copy the proxy binary
COPY --from=rust-builder /neon/target/debug/proxy ./neon-proxy

COPY ./Caddyfile Caddyfile
COPY ./start.sh start.sh

RUN chmod +x start.sh

# SUPPLY-001: this is local test-only infrastructure (never shipped in the
# production image), but it's still scanned by `trivy fs` and previously ran
# as root with no USER declared. Both ports it serves (4444, 4445) are
# unprivileged, so a dedicated non-root account works without capability
# grants; `/app` and everything under it is chowned to that account so
# caddy's on-disk cache and the proxy's cert files stay writable.
RUN groupadd --system --gid 10001 neonproxy \
  && useradd --system --uid 10001 --gid neonproxy --home-dir /app --no-create-home neonproxy \
  && chown -R neonproxy:neonproxy /app
USER neonproxy:neonproxy

EXPOSE 4444
ENTRYPOINT ["./start.sh"]
