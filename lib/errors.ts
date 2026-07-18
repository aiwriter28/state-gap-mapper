export type ApiErrorCode =
  | "bad_request"
  | "too_long"
  | "payload_too_large"
  | "rate_limited"
  | "model_refusal"
  | "model_invalid"
  | "upstream_failure";

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  retryable: boolean;
}

export const API_ERROR_RETRYABLE: Readonly<Record<ApiErrorCode, boolean>> = {
  bad_request: false,
  too_long: false,
  payload_too_large: false,
  rate_limited: true,
  model_refusal: false,
  model_invalid: true,
  upstream_failure: true,
};

export function apiError(code: ApiErrorCode, message: string): ApiError {
  return { code, message, retryable: API_ERROR_RETRYABLE[code] };
}
