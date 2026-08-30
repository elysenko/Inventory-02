import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

/**
 * The API lives behind the same origin as the SPA: nginx proxies `/api/` to the
 * NestJS container. The base is resolved from <base href> rather than hardcoded
 * to `/api`, because deployments are served under `/<image-name>/` — an absolute
 * `/api` would escape that prefix and 404 against the static root.
 *
 * base href `/`            -> `/api`
 * base href `/my-app-123/` -> `/my-app-123/api`
 */
function resolveApiBase(): string {
  try {
    const href = document.querySelector('base')?.getAttribute('href') ?? '/';
    return new URL('api', new URL(href, window.location.origin)).pathname;
  } catch {
    return '/api';
  }
}

export const API_BASE = resolveApiBase();

/** Query values that are null/undefined/'' are dropped rather than sent as empty. */
export type QueryValue = string | number | boolean | null | undefined;

function toParams(query?: Record<string, QueryValue>): HttpParams | undefined {
  if (!query) return undefined;
  let params = new HttpParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined || value === '') continue;
    params = params.set(key, String(value));
  }
  return params.keys().length ? params : undefined;
}

/**
 * A failed API call, already reduced to something a template can render.
 * `field` carries the offending field name for 409s (duplicate sku / location name)
 * so forms can highlight the right input.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isUnauthorized(): boolean { return this.status === 401; }
  get isForbidden(): boolean { return this.status === 403; }
  get isNotFound(): boolean { return this.status === 404; }
  get isConflict(): boolean { return this.status === 409; }
}

/**
 * Nest's ValidationPipe returns `message` as a string[] of per-field failures;
 * every other exception returns a plain string. Both must become one line.
 */
function readMessage(error: HttpErrorResponse): string {
  const body = error.error as { message?: string | string[]; error?: string } | string | null;

  if (typeof body === 'string' && body.trim()) return body;

  if (body && typeof body === 'object') {
    const { message } = body;
    if (Array.isArray(message) && message.length) return message.join(' ');
    if (typeof message === 'string' && message.trim()) return message;
    if (typeof body.error === 'string' && body.error.trim()) return body.error;
  }

  // status 0 means the request never reached the server (offline, DNS, CORS).
  if (error.status === 0) return 'Cannot reach the server. Check your connection and try again.';
  return `Request failed (${error.status}).`;
}

function readField(error: HttpErrorResponse): string | undefined {
  const body = error.error as { field?: unknown } | null;
  return body && typeof body === 'object' && typeof body.field === 'string' ? body.field : undefined;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  get<T>(path: string, query?: Record<string, QueryValue>): Observable<T> {
    return this.http.get<T>(API_BASE + path, { params: toParams(query) }).pipe(catchError(normalize));
  }

  post<T>(path: string, body: unknown): Observable<T> {
    return this.http.post<T>(API_BASE + path, body).pipe(catchError(normalize));
  }

  patch<T>(path: string, body: unknown): Observable<T> {
    return this.http.patch<T>(API_BASE + path, body).pipe(catchError(normalize));
  }

  delete<T>(path: string): Observable<T> {
    return this.http.delete<T>(API_BASE + path).pipe(catchError(normalize));
  }
}

function normalize(error: unknown): Observable<never> {
  if (error instanceof HttpErrorResponse) {
    return throwError(() => new ApiError(error.status, readMessage(error), readField(error)));
  }
  return throwError(() => new ApiError(0, 'Something went wrong. Please try again.'));
}
