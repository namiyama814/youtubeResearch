function unauthorized() {
  return new Response('認証が必要です。', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="YouTube Researcher", charset="UTF-8"',
      'Cache-Control': 'no-store'
    }
  });
}

export async function onRequest(context) {
  const { BASIC_AUTH_USER, BASIC_AUTH_PASSWORD } = context.env;
  // Fail closed when credentials have not been configured in Cloudflare.
  if (!BASIC_AUTH_USER || !BASIC_AUTH_PASSWORD) {
    return new Response('認証設定が完了していません。', { status: 503 });
  }

  const authorization = context.request.headers.get('Authorization');
  if (!authorization?.startsWith('Basic ')) return unauthorized();

  try {
    const credentials = atob(authorization.slice(6));
    const separator = credentials.indexOf(':');
    const user = credentials.slice(0, separator);
    const password = credentials.slice(separator + 1);
    if (separator < 0 || user !== BASIC_AUTH_USER || password !== BASIC_AUTH_PASSWORD) return unauthorized();
  } catch {
    return unauthorized();
  }
  return context.next();
}
