/**
 * Cloudflare Worker for Subpath Proxying:
 * - ai925.in/app/* -> Your local server
 * - oraani.in/app/* -> Your local server
 * 
 * Your main websites at ai925.in and oraani.in remain 100% untouched.
 */

const TARGET_ORIGIN = 'https://entangled-stem-cinema.ngrok-free.dev';

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Forward path and query params to the permanent tunnel origin
    const targetUrl = new URL(url.pathname + url.search, TARGET_ORIGIN);

    // Preserve headers and pass the original host for automatic brand detection
    const headers = new Headers(request.headers);
    headers.set('x-forwarded-host', url.host);
    headers.set('ngrok-skip-browser-warning', 'true');

    // Create the proxied request
    const proxyRequest = new Request(targetUrl, {
      method: request.method,
      headers: headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
      redirect: 'follow'
    });

    try {
      const response = await fetch(proxyRequest);
      return response;
    } catch (err) {
      return new Response('Unable to connect to local server. Please ensure the laptop server is running.', {
        status: 502,
        headers: { 'Content-Type': 'text/plain' }
      });
    }
  }
};
