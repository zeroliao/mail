import axios from "axios";

const AUTH_TOKEN_KEY = "mail-control-token";

let authToken = typeof window !== "undefined" ? window.localStorage.getItem(AUTH_TOKEN_KEY) ?? "" : "";

type ApiErrorDetails = Record<string, unknown> | Array<Record<string, unknown>> | undefined;

export class ApiClientError extends Error {
  readonly status?: number;
  readonly details?: ApiErrorDetails;

  constructor(message: string, options?: { status?: number; details?: ApiErrorDetails }) {
    super(message);
    this.name = "ApiClientError";
    this.status = options?.status;
    this.details = options?.details;
  }
}

export const setAuthToken = (token: string) => {
  authToken = token;
  if (typeof window !== "undefined") {
    if (token) {
      window.localStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      window.localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  }
};

export const getAuthToken = () => authToken;

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api/v1",
  timeout: 12000
});

apiClient.interceptors.request.use((config) => {
  if (authToken) {
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error)) {
      const payload = error.response?.data;
      const message =
        payload && typeof payload === "object" && typeof payload.message === "string"
          ? payload.message
          : error.message || "请求失败";

      const details =
        payload && typeof payload === "object" && "details" in payload
          ? (payload.details as ApiErrorDetails)
          : undefined;

      return Promise.reject(
        new ApiClientError(message, {
          status: error.response?.status,
          details
        })
      );
    }

    return Promise.reject(error);
  }
);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const getApiErrorMessage = (error: unknown, fallback = "请求失败") => {
  if (error instanceof ApiClientError) {
    return error.message;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
};

export const getApiErrorDescription = (error: unknown) => {
  if (!(error instanceof ApiClientError) || !isRecord(error.details)) {
    return "";
  }

  return typeof error.details.error_description === "string" ? error.details.error_description : "";
};

export const getApiValidationIssues = (error: unknown) => {
  if (!(error instanceof ApiClientError) || !Array.isArray(error.details)) {
    return [];
  }

  return error.details
    .filter(isRecord)
    .map((issue) => {
      const path = Array.isArray(issue.path)
        ? issue.path.filter((segment) => typeof segment === "string" || typeof segment === "number").join(".")
        : "";
      const message = typeof issue.message === "string" ? issue.message : "";
      return [path, message].filter(Boolean).join(": ");
    })
    .filter(Boolean);
};
