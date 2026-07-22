import winston from "winston";
import dotenv from "dotenv";
import { requestContext } from "./context.js";

dotenv.config();

const { combine, timestamp, json, colorize, printf, errors } = winston.format;

// Clean format for local development console output
const devFormat = printf(
  ({ level, message, timestamp, stack, service, requestId, correlationId, ...meta }) => {
    let trace = "";
    if (requestId || correlationId) {
      trace = ` [Req: ${requestId || "-"}] [Corr: ${correlationId || "-"}]`;
    }
    let logOutput = `[${timestamp}] [${service || "system"}]${trace} ${level}: ${message}`;
    if (stack) {
      logOutput += `\nStack Trace:\n${stack}`;
    }
    if (Object.keys(meta).length > 0 && !stack) {
      logOutput += ` | Meta: ${JSON.stringify(meta)}`;
    }
    return logOutput;
  }
);

const injectRequestContext = winston.format((info) => {
  const store = requestContext.getStore();
  if (store) {
    info.requestId = store.requestId;
    info.correlationId = store.correlationId;
    if (store.userId) info.userId = store.userId;
  }
  return info;
});

export const getLogger = (serviceName = "system") => {
  return winston.createLogger({
    level: process.env.LOG_LEVEL || "info",
    defaultMeta: { service: serviceName },
    format: combine(
      errors({ stack: true }),
      timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
      injectRequestContext()
    ),
    transports: [
      new winston.transports.Console({
        format: combine(
          ...(process.env.NODE_ENV === "production" ? [json()] : [colorize(), devFormat])
        ),
      }),
    ],
  });
};

export default getLogger;
