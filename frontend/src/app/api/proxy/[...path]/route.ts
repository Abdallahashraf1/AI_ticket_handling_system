import { NextRequest, NextResponse } from 'next/server'

const configuredBaseUrl =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL

const BACKEND_BASE_URLS = [
  configuredBaseUrl,
  'http://127.0.0.1:8000',
  'http://localhost:8000',
].filter((value, index, arr): value is string => Boolean(value) && arr.indexOf(value as string) === index)
let preferredBaseUrl: string | null = null

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

const UPSTREAM_TIMEOUT_MS = 12000

async function forward(request: NextRequest, path: string[]) {
  const query = request.nextUrl.search || ''
  const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.text()
  let lastError = 'Backend unreachable'
  const requestStart = Date.now()
  const requestPath = `/api/${path.join('/')}${query}`
  const requestMethod = request.method

  const orderedBaseUrls = preferredBaseUrl
    ? [preferredBaseUrl, ...BACKEND_BASE_URLS.filter((url) => url !== preferredBaseUrl)]
    : BACKEND_BASE_URLS

  for (const baseUrl of orderedBaseUrls) {
    const target = `${baseUrl}/api/${path.join('/')}${query}`
    const attemptStart = Date.now()
    try {
      const response = await fetchWithTimeout(
        target,
        {
          method: request.method,
          headers: {
            ...(request.headers.get('content-type')
              ? { 'Content-Type': request.headers.get('content-type') as string }
              : {}),
            ...(request.headers.get('authorization')
              ? { Authorization: request.headers.get('authorization') as string }
              : {}),
          },
          body,
          cache: 'no-store',
        },
        UPSTREAM_TIMEOUT_MS
      )
      preferredBaseUrl = baseUrl
      const attemptMs = Date.now() - attemptStart
      const totalMs = Date.now() - requestStart
      console.info(
        `[proxy] ${requestMethod} ${requestPath} -> ${baseUrl} status=${response.status} attempt_ms=${attemptMs} total_ms=${totalMs}`
      )

      const text = await response.text()
      return new NextResponse(text, {
        status: response.status,
        headers: {
          'Content-Type': response.headers.get('content-type') || 'application/json',
        },
      })
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Backend request failed'
      const attemptMs = Date.now() - attemptStart
      console.warn(
        `[proxy] ${requestMethod} ${requestPath} -> ${baseUrl} failed attempt_ms=${attemptMs} error=${lastError}`
      )
    }
  }

  const totalMs = Date.now() - requestStart
  console.error(
    `[proxy] ${requestMethod} ${requestPath} failed all upstreams total_ms=${totalMs} error=${lastError}`
  )
  return NextResponse.json(
    { detail: `Proxy failed to reach backend: ${lastError}` },
    { status: 502 }
  )
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params
  return forward(request, path)
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params
  return forward(request, path)
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params
  return forward(request, path)
}

export async function PUT(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params
  return forward(request, path)
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params
  return forward(request, path)
}
