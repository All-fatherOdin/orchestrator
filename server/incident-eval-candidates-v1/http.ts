import type express from "express";
import {
  ChangeControlError,
  type ChangeControlStore,
} from "../change-control-v1/index.ts";
import {
  INCIDENT_EVAL_CANDIDATE_LIMITS_V1,
  IncidentEvalCandidateErrorV1,
} from "./index.ts";

const INCIDENT_EVAL_CANDIDATE_RAW_JSON_BODY_BYTES_V1 = Symbol(
  "incidentEvalCandidateRawJsonBodyBytesV1",
);

const INCIDENT_EVAL_CANDIDATE_PREVIEW_PATH_V1 =
  "/api/change-control/projects/:projectId/incidents/:incidentId/eval-candidates/preview";
const INCIDENT_EVAL_CANDIDATE_RECORD_PATH_V1 =
  "/api/change-control/projects/:projectId/incidents/:incidentId/eval-candidates";
const INCIDENT_EVAL_CANDIDATE_EXACT_PATH_V1 =
  /^\/api\/change-control\/projects\/[^/]+\/incidents\/[^/]+\/eval-candidates(?:\/preview)?$/;

export function captureIncidentEvalCandidateJsonBodyByteLengthV1(
  request: express.Request,
  _response: express.Response,
  body: Buffer,
): void {
  Object.defineProperty(request, INCIDENT_EVAL_CANDIDATE_RAW_JSON_BODY_BYTES_V1, {
    value: body.byteLength,
    configurable: false,
    enumerable: false,
    writable: false,
  });
}

function assertIncidentEvalCandidateRawRequestLimitV1(
  request: express.Request,
): void {
  const rawByteLength = (
    request as express.Request & {
      [INCIDENT_EVAL_CANDIDATE_RAW_JSON_BODY_BYTES_V1]?: number;
    }
  )[INCIDENT_EVAL_CANDIDATE_RAW_JSON_BODY_BYTES_V1];
  if (rawByteLength === undefined)
    throw new IncidentEvalCandidateErrorV1(
      "REQUEST_SCHEMA_INVALID",
      "Raw request byte metadata is unavailable.",
    );
  if (rawByteLength > INCIDENT_EVAL_CANDIDATE_LIMITS_V1.maxRequestBytes)
    throw new IncidentEvalCandidateErrorV1(
      "REQUEST_LIMIT_EXCEEDED",
      "The request exceeds the fixed raw byte limit.",
      413,
    );
}

type IncidentEvalCandidateHttpStoreV1 = Pick<
  ChangeControlStore,
  "previewIncidentEvalCandidateV1" | "recordIncidentEvalCandidateV1"
>;

function sendIncidentEvalCandidateErrorV1(
  response: express.Response,
  error: unknown,
) {
  if (error instanceof IncidentEvalCandidateErrorV1)
    return response.status(error.status).json({
      error: "Incident eval candidate request rejected.",
      code: error.reasonCode,
    });
  if (error instanceof ChangeControlError) {
    const code =
      error.code === "CORRUPT_LEDGER"
        ? "LEDGER_CORRUPTION"
        : error.code === "NOT_FOUND"
          ? "INCIDENT_MISSING"
          : error.code === "INVALID_INPUT"
            ? "REQUEST_SCHEMA_INVALID"
            : "CONCURRENT_STALE_CONTENDER";
    return response.status(error.status).json({
      error: "Incident eval candidate request rejected.",
      code,
    });
  }
  return response.status(500).json({
    error: "Incident eval candidate service unavailable.",
    code: "LEDGER_CORRUPTION",
  });
}

function sendIncidentEvalCandidateHttpErrorV1(
  response: express.Response,
  status: number,
  code: "METHOD_NOT_ALLOWED" | "MALFORMED_JSON" | "REQUEST_TOO_LARGE",
) {
  return response.status(status).json({
    error: "Incident eval candidate request rejected.",
    code,
  });
}

function isIncidentEvalCandidateExactPathV1(request: express.Request): boolean {
  return INCIDENT_EVAL_CANDIDATE_EXACT_PATH_V1.test(request.path);
}

export function installIncidentEvalCandidateRoutesV1(
  targetApp: express.Express,
  store: IncidentEvalCandidateHttpStoreV1,
) {
  targetApp.post(
    INCIDENT_EVAL_CANDIDATE_PREVIEW_PATH_V1,
    async (request, response) => {
      try {
        assertIncidentEvalCandidateRawRequestLimitV1(request);
        return response.json(
          await store.previewIncidentEvalCandidateV1(
            request.params.projectId,
            request.params.incidentId,
            request.body,
          ),
        );
      } catch (error) {
        return sendIncidentEvalCandidateErrorV1(response, error);
      }
    },
  );
  targetApp.post(
    INCIDENT_EVAL_CANDIDATE_RECORD_PATH_V1,
    async (request, response) => {
      try {
        assertIncidentEvalCandidateRawRequestLimitV1(request);
        const receipt = await store.recordIncidentEvalCandidateV1(
          request.params.projectId,
          request.params.incidentId,
          request.body,
        );
        return response
          .status(receipt.outcome === "recorded" ? 201 : 200)
          .json(receipt);
      } catch (error) {
        return sendIncidentEvalCandidateErrorV1(response, error);
      }
    },
  );
  targetApp.all(
    [
      INCIDENT_EVAL_CANDIDATE_PREVIEW_PATH_V1,
      INCIDENT_EVAL_CANDIDATE_RECORD_PATH_V1,
    ],
    (_request, response) =>
      sendIncidentEvalCandidateHttpErrorV1(
        response,
        405,
        "METHOD_NOT_ALLOWED",
      ),
  );
  targetApp.use(
    (
      error: unknown,
      request: express.Request,
      response: express.Response,
      next: express.NextFunction,
    ) => {
      if (!isIncidentEvalCandidateExactPathV1(request)) return next(error);
      const parserError = error as { type?: unknown };
      if (parserError.type === "entity.parse.failed")
        return sendIncidentEvalCandidateHttpErrorV1(
          response,
          400,
          "MALFORMED_JSON",
        );
      if (parserError.type === "entity.too.large")
        return sendIncidentEvalCandidateHttpErrorV1(
          response,
          413,
          "REQUEST_TOO_LARGE",
        );
      return next(error);
    },
  );
}
