// Gmail connector — OAuth2 PKCE flow + Gmail REST API
// Uses Electron's net module for HTTP, safeStorage for token encryption
import { net, safeStorage, shell } from "electron";
import http from "node:http";
import crypto from "node:crypto";

export const DEFAULT_GOOGLE_CLIENT_ID = "1092609867457-ops0dv1svm1k59no81q17tturn11kkb5.apps.googleusercontent.com";

export interface GmailTokens {
  accessToken: string;
  refreshToken: string;
  email: string;
  expiresAt: string; // ISO
}

export interface RawGmailMessage {
  id: string;
  threadId: string;
  subject: string;
  sender: string;
  body: string;       // plain text extracted from payload
  receivedAt: string; // ISO
  isRead: boolean;
}

export function encryptToken(value: string): string {
  if (!safeStorage.isEncryptionAvailable()) return value;
  return "enc:" + safeStorage.encryptString(value).toString("base64");
}

export function decryptToken(value: string): string {
  if (value.startsWith("enc:")) {
    const buf = Buffer.from(value.slice(4), "base64");
    return safeStorage.decryptString(buf);
  }
  return value;
}

function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

interface NetFetchResponse {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
}

async function netFetch(url: string, options: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<NetFetchResponse> {
  return new Promise((resolve, reject) => {
    const req = net.request({ url, method: options.method ?? "GET" });
    if (options.headers) {
      for (const [k, v] of Object.entries(options.headers)) req.setHeader(k, v);
    }
    const chunks: Buffer[] = [];
    req.on("response", (res) => {
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          text: () => Promise.resolve(text),
          json: () => Promise.resolve(text ? JSON.parse(text) : null)
        });
      });
    });
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

// Start OAuth flow. Returns tokens on success or throws.
export async function startGmailOAuth(clientId: string, clientSecret = ""): Promise<GmailTokens> {
  const { verifier, challenge } = generatePKCE();
  const state = crypto.randomBytes(16).toString("base64url");
  const port = await getFreePort();
  const redirectUri = `http://127.0.0.1:${port}/oauth/callback`;

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email");
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", state);

  // Open browser for user to authorize
  void shell.openExternal(authUrl.toString());

  const OAUTH_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url!, `http://127.0.0.1:${port}`);
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      const returnedState = url.searchParams.get("state");
      res.writeHead(200, { "Content-Type": "text/html" });
      if (code && returnedState === state) {
        res.end("<html><body><h2>Nerve: Gmail connected! You can close this tab.</h2></body></html>");
        clearTimeout(timer);
        server.close();
        resolve(code);
      } else if (code) {
        res.end("<html><body><h2>Nerve: Authorization failed. Please try again.</h2></body></html>");
        clearTimeout(timer);
        server.close();
        reject(new Error("OAuth state mismatch"));
      } else {
        res.end("<html><body><h2>Nerve: Authorization failed. Please try again.</h2></body></html>");
        clearTimeout(timer);
        server.close();
        reject(new Error(error ?? "OAuth cancelled"));
      }
    });
    server.listen(port);
    server.on("error", (err) => { clearTimeout(timer); reject(err); });
    const timer = setTimeout(() => {
      server.close();
      reject(new Error("Gmail OAuth timed out — no response within 5 minutes. Please try again."));
    }, OAUTH_TIMEOUT_MS);
  });

  const tokenBody = new URLSearchParams({
    code,
    client_id: clientId,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    code_verifier: verifier
  });
  if (clientSecret) tokenBody.set("client_secret", clientSecret);

  // Exchange code for tokens. Some Google OAuth client types require client_secret even with PKCE.
  const tokenRes = await netFetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenBody.toString()
  });

  if (!tokenRes.ok) throw new Error(await googleApiError("Token exchange failed", tokenRes));
  const tokenData = await tokenRes.json() as any;

  // Get user email
  const userRes = await netFetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` }
  });
  if (!userRes.ok) throw new Error(await googleApiError("User info fetch failed", userRes));
  const userData = await userRes.json() as any;

  return {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token ?? "",
    email: userData.email ?? "",
    expiresAt: new Date(Date.now() + (tokenData.expires_in ?? 3600) * 1000).toISOString()
  };
}

// Refresh the access token using the stored refresh token
export async function refreshGmailToken(clientId: string, encryptedRefreshToken: string, clientSecret = ""): Promise<{ accessToken: string; expiresAt: string }> {
  const refreshToken = decryptToken(encryptedRefreshToken);
  const tokenBody = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId
  });
  if (clientSecret) tokenBody.set("client_secret", clientSecret);
  const res = await netFetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenBody.toString()
  });
  if (!res.ok) throw new Error(await googleApiError("Token refresh failed", res));
  const data = await res.json() as any;
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString()
  };
}

// Fetch recent unread Gmail messages (max 20)
export async function fetchGmailMessages(accessToken: string, maxMessages = 20, unreadOnly = true): Promise<RawGmailMessage[]> {
  const query = unreadOnly ? "is:unread" : "in:inbox";
  const listRes = await netFetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxMessages}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!listRes.ok) throw new Error(await googleApiError("Gmail list failed", listRes));
  const listData = await listRes.json() as any;
  const messages: RawGmailMessage[] = [];
  for (const msg of (listData.messages ?? []).slice(0, maxMessages)) {
    try {
      const msgRes = await netFetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!msgRes.ok) continue;
      const msgData = await msgRes.json() as any;
      messages.push(parseGmailMessage(msgData));
    } catch { /* skip malformed messages */ }
  }
  return messages;
}

function parseGmailMessage(raw: any): RawGmailMessage {
  const headers: Record<string, string> = {};
  for (const h of (raw.payload?.headers ?? [])) headers[h.name.toLowerCase()] = h.value;
  const body = extractBody(raw.payload);
  const isRead = !((raw.labelIds ?? []) as string[]).includes("UNREAD");
  return {
    id: raw.id,
    threadId: raw.threadId,
    subject: headers["subject"] ?? "(no subject)",
    sender: headers["from"] ?? "Unknown",
    body: body.slice(0, 2000), // cap at 2k chars for AI
    receivedAt: new Date(parseInt(raw.internalDate ?? "0", 10)).toISOString(),
    isRead
  };
}

function extractBody(payload: any): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf8");
  }
  for (const part of (payload.parts ?? [])) {
    const text = extractBody(part);
    if (text) return text;
  }
  return "";
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as any;
      server.close(() => resolve(addr.port));
    });
    server.on("error", reject);
  });
}

async function googleApiError(prefix: string, response: NetFetchResponse): Promise<string> {
  const body = await response.text();
  if (!body) return `${prefix}: ${response.status}`;
  try {
    const parsed = JSON.parse(body) as { error?: string | { message?: string; error_description?: string }; error_description?: string };
    if (typeof parsed.error === "string") {
      return `${prefix}: ${response.status} ${parsed.error_description ?? parsed.error}`;
    }
    const message = parsed.error?.message ?? parsed.error?.error_description ?? parsed.error_description;
    return `${prefix}: ${response.status}${message ? ` ${message}` : ""}`;
  } catch {
    return `${prefix}: ${response.status} ${body.slice(0, 300)}`;
  }
}
