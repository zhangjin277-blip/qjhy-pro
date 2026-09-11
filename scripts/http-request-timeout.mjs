import http from "node:http";

const requestTimeoutMs = Number.parseInt(
  process.env.HTTP_REQUEST_TIMEOUT_MS ?? "600000",
  10,
);

if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs <= 0) {
  throw new Error("HTTP_REQUEST_TIMEOUT_MS must be a positive integer");
}

const createServer = http.createServer;

http.createServer = function createServerWithRequestTimeout(...args) {
  const server = createServer.apply(this, args);
  server.requestTimeout = requestTimeoutMs;
  return server;
};
