FROM alpine:latest as builder1
RUN apk update && apk add make musl-dev go
RUN apk add --no-cache rust cargo
RUN mkdir -p /build/goffj
COPY ./goffj/ /build/goffj
WORKDIR /build/goffj
RUN go mod download
RUN GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -o /build/goffj-bin main.go
RUN mkdir -p /build/pgctl
COPY ./pgctl/ /build/pgctl
WORKDIR /build/pgctl
RUN cargo build --release

FROM alpine:latest

RUN apk update && apk add \
    curl vim bash git cmake gcc \
    && rm -rf /var/lib/apt/lists/*

ARG user=app
ARG group=app
# create group and user
RUN addgroup -S ${group} && adduser -S ${user} -G ${group}

WORKDIR /home/app

COPY bootup.sh /home/app/bootup.sh
COPY --from=builder1 /build/goffj-bin /app/goffj
COPY --from=builder1 /build/pgctl/target/release/pgctl /app/pgctl

USER ${user}

#API
EXPOSE 8500
EXPOSE 8501

WORKDIR /app

# TODO: change this to goffj server and remove the script
CMD [ "/home/app/bootup.sh" ]

