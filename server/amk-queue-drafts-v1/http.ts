import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { captureAmkJsonBodyByteLengthV1 } from "../amk-project-artifacts-v2/http.ts";
import {
  AMK_QUEUE_DRAFT_LIMITS_V1,
  AmkQueueDraftError,
  type AmkQueueDraftErrorCodeV1,
} from "./mapper.ts";
import type { AmkQueueDraftServiceV1 } from "./service.ts";

export const AMK_QUEUE_DRAFT_BASE_PATH_V1 = "/api/amk-queue-drafts/v1";
export const AMK_QUEUE_DRAFT_PREVIEW_PATH_V1 =
  "/api/amk-queue-drafts/v1/preview";

const RAW_BODY_BYTES = Symbol("amkQueueDraftRawBodyBytes");
const HTTP_MESSAGES = Object.freeze({
  METHOD_NOT_ALLOWED: "The AMK queue-draft route does not support this method.",
  SERVICE_UNAVAILABLE: "The AMK queue-draft service is unavailable.",
});

type HttpOnlyErrorCodeV1 = keyof typeof HTTP_MESSAGES;
type HttpErrorCodeV1 = AmkQueueDraftErrorCodeV1 | HttpOnlyErrorCodeV1;
type RequestWithRawBytes = Request & { [RAW_BODY_BYTES]?: number };

export function captureAmkQueueDraftJsonBodyByteLengthV1(
  request: Request,
  response: Response,
  body: Buffer,
): void {
  captureAmkJsonBodyByteLengthV1(request, response, body);
  Object.defineProperty(request, RAW_BODY_BYTES, {
    value: body.byteLength,
    configurable: false,
    enumerable: false,
    writable: false,
  });
}

function rawRequestBytes(request: Request): number {
  return (request as RequestWithRawBytes)[RAW_BODY_BYTES] ?? 0;
}

function statusFor(code: HttpErrorCodeV1): number {
  if (code === "METHOD_NOT_ALLOWED") return 405;
  if (code === "SERVICE_UNAVAILABLE") return 503;
  if (["REQUEST_TOO_LARGE", "RESPONSE_TOO_LARGE", "LIMIT_EXCEEDED"].includes(code))
    return 413;
  if (["SOURCE_STALE", "TARGET_STALE", "TARGET_CONFLICT", "TARGET_INVALID"].includes(code))
    return 409;
  return 400;
}

function sendError(
  response: Response,
  error: unknown,
): Response {
  const known = error instanceof AmkQueueDraftError;
  const code: HttpErrorCodeV1 = known ? error.code : "SERVICE_UNAVAILABLE";
  const message = known ? error.message : HTTP_MESSAGES.SERVICE_UNAVAILABLE;
  return response.status(statusFor(code)).json({
    contractType: "AmkQueueDraftHttpErrorV1",
    contractVersion: "1.0",
    code,
    message,
    requestScoped: true,
    filesModified: false,
  });
}

function sendSuccess(response: Response, value: unknown): Response {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return sendError(response, new AmkQueueDraftError("RESPONSE_TOO_LARGE"));
  }
  if (Buffer.byteLength(serialized, "utf8") > AMK_QUEUE_DRAFT_LIMITS_V1.maxResponseBytes)
    return sendError(response, new AmkQueueDraftError("RESPONSE_TOO_LARGE"));
  return response.type("application/json").send(serialized);
}

function sendMethodNotAllowed(response: Response, allow: "GET" | "POST"): Response {
  response.set("Allow", allow);
  return response.status(405).json({
    contractType: "AmkQueueDraftHttpErrorV1",
    contractVersion: "1.0",
    code: "METHOD_NOT_ALLOWED",
    message: HTTP_MESSAGES.METHOD_NOT_ALLOWED,
    requestScoped: true,
    filesModified: false,
  });
}

function isBodyParserError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const bodyError = error as { type?: unknown; status?: unknown };
  return bodyError.type === "entity.too.large" || bodyError.type === "entity.parse.failed" ||
    bodyError.status === 400 || bodyError.status === 413;
}

export function installAmkQueueDraftRoutesV1(
  targetApp: Express,
  service: Pick<AmkQueueDraftServiceV1, "discover" | "preview">,
): void {
  const parser = express.json({
    limit: AMK_QUEUE_DRAFT_LIMITS_V1.maxRequestBytes,
    strict: true,
    verify: captureAmkQueueDraftJsonBodyByteLengthV1,
  });

  targetApp.head(AMK_QUEUE_DRAFT_BASE_PATH_V1, (_request, response) =>
    sendMethodNotAllowed(response, "GET"));
  targetApp.get(AMK_QUEUE_DRAFT_BASE_PATH_V1, (request, response) => {
    try {
      if (Object.keys(request.query).length > 0)
        throw new AmkQueueDraftError("REQUEST_INVALID");
      return sendSuccess(response, service.discover());
    } catch (error) {
      return sendError(response, error);
    }
  });
  targetApp.head(AMK_QUEUE_DRAFT_PREVIEW_PATH_V1, (_request, response) =>
    sendMethodNotAllowed(response, "POST"));
  targetApp.post(AMK_QUEUE_DRAFT_PREVIEW_PATH_V1, parser, (request, response) => {
    try {
      if (rawRequestBytes(request) > AMK_QUEUE_DRAFT_LIMITS_V1.maxRequestBytes)
        throw new AmkQueueDraftError("REQUEST_TOO_LARGE");
      return sendSuccess(response, service.preview(request.body));
    } catch (error) {
      return sendError(response, error);
    }
  });
  targetApp.all(AMK_QUEUE_DRAFT_BASE_PATH_V1, (_request, response) =>
    sendMethodNotAllowed(response, "GET"));
  targetApp.all(AMK_QUEUE_DRAFT_PREVIEW_PATH_V1, (_request, response) =>
    sendMethodNotAllowed(response, "POST"));
  targetApp.use(
    AMK_QUEUE_DRAFT_BASE_PATH_V1,
    (error: unknown, _request: Request, response: Response, _next: NextFunction) => {
      if (!isBodyParserError(error)) return sendError(response, error);
      const bodyError = error as { type?: unknown; status?: unknown };
      return sendError(
        response,
        new AmkQueueDraftError(
          bodyError.type === "entity.too.large" || bodyError.status === 413
            ? "REQUEST_TOO_LARGE"
            : "REQUEST_INVALID",
        ),
      );
    },
  );
}
