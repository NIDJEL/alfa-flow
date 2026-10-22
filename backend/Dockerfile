FROM golang:1.27.3-alpine AS build
WORKDIR /src
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ .
RUN CGO_ENABLED=0 go build -trimpath -o /api ./cmd/api
FROM alpine:3.22.1
RUN adduser -D -u 10001 app
WORKDIR /app
COPY --from=build /api /app/server
COPY api /app/contracts
USER app
EXPOSE 8080
CMD ["/app/server"]
