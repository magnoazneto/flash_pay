FROM golang:1.23-alpine AS deps

WORKDIR /app

COPY go.mod go.sum* ./
RUN mkdir -p /root/go/pkg/mod && go mod download

FROM golang:1.23-alpine AS dev

WORKDIR /app

RUN go install github.com/air-verse/air@v1.61.7
RUN go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@v4.18.3
COPY --from=deps /root/go/pkg/mod /root/go/pkg/mod
COPY . .

EXPOSE 8080

CMD ["air", "-c", ".air.toml"]
