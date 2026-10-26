// main.ts
// 邀请码分发平台
// 技术栈: Deno, Deno Deploy, Deno KV, Deno Cron, Bootstrap 5

// --- 导入模块 ---
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getCookies, setCookie, deleteCookie } from "https://deno.land/std@0.224.0/http/cookie.ts";
import { OAuth2Client } from "https://deno.land/x/oauth2_client@v1.0.2/mod.ts"; // 用于 OAuth
// Deno KV 是 Deno 内置的，无需显式导入 Deno.openKv

// --- 配置常量 ---
// BASE_URL 优先从环境变量获取，否则默认为 https://invite.deno.dev
const BASE_URL = Deno.env.get("BASE_URL") || "https://invite.deno.dev";
const IS_HTTPS = BASE_URL.startsWith("https://");

// GitHub OAuth 配置 (请在环境变量中设置)
const GITHUB_CLIENT_ID = Deno.env.get("GITHUB_CLIENT_ID") || "your_github_client_id";
const GITHUB_CLIENT_SECRET = Deno.env.get("GITHUB_CLIENT_SECRET") || "your_github_client_secret";

// Linux.do OAuth 配置 (使用示例中提供的测试参数或在环境变量中设置)
const LINUXDO_CLIENT_ID = Deno.env.get("LINUXDO_CLIENT_ID") || "your_client_id";
const LINUXDO_CLIENT_SECRET = Deno.env.get("LINUXDO_CLIENT_SECRET") || "your_client_secret";
// Linux.do 要求 redirect_uri 在其平台注册，这里使用示例中的，确保 BASE_URL 对应
const LINUXDO_REDIRECT_URI = `${BASE_URL}/oauth2/callback`; // Linux.do 回调 URL
const LINUXDO_AUTHORIZE_URL = "https://connect.linux.do/oauth2/authorize";
const LINUXDO_TOKEN_URL = "https://connect.linux.do/oauth2/token";
const LINUXDO_USER_INFO_URL = "https://connect.linux.do/api/user";

const SESSION_SECRET_KEY = Deno.env.get("SESSION_SECRET_KEY") || "a_very_strong_secret_key_for_session_!@#$%^&*()"; // 用于签名会话 Cookie
const SESSION_COOKIE_NAME = "auth_session";

// Resend API 配置 (请在环境变量中设置)
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const RESEND_SENDER_EMAIL = Deno.env.get("RESEND_SENDER_EMAIL");


// --- Deno KV 初始化 ---
const kv = await Deno.openKv();

// --- SVG 图标 (Bootstrap 5 有自己的图标库，但这些可以继续使用或替换) ---
const IconPlus = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-plus-lg" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M8 2a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5a.5.5 0 0 1 0-1h5v-5A.5.5 0 0 1 8 2Z"/></svg>`;
const IconTrash = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-trash3" viewBox="0 0 16 16"><path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5ZM11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H2.506a.58.58 0 0 0-.01 0H1.5a.5.5 0 0 0 0 1h.538l.853 10.66A2 2 0 0 0 4.885 16h6.23a2 2 0 0 0 1.994-1.84l.853-10.66h.538a.5.5 0 0 0 0-1h-.995a.59.59 0 0 0-.01 0H11Zm1.958 1-.846 10.58a1 1 0 0 1-.997.92h-6.23a1 1 0 0 1-.997-.92L3.042 3.5h9.916Zm-7.487 1a.5.5 0 0 1 .528.47l.5 8.5a.5.5 0 0 1-.998.06L5 5.03a.5.5 0 0 1 .47-.53Zm5.058 0a.5.5 0 0 1 .47.53l-.5 8.5a.5.5 0 1 1-.998-.06l.5-8.5a.5.5 0 0 1 .528-.47ZM8 4.5a.5.5 0 0 1 .5.5v8.5a.5.5 0 0 1-1 0V5a.5.5 0 0 1 .5-.5Z"/></svg>`;
const IconLogin = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-box-arrow-in-right" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M6 3.5a.5.5 0 0 1 .5-.5h8a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5v-2a.5.5 0 0 0-1 0v2A1.5 1.5 0 0 0 6.5 14h8a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 14.5 2h-8A1.5 1.5 0 0 0 5 3.5v2a.5.5 0 0 0 1 0v-2z"/><path fill-rule="evenodd" d="M11.854 8.354a.5.5 0 0 0 0-.708l-3-3a.5.5 0 1 0-.708.708L10.293 7.5H1.5a.5.5 0 0 0 0 1h8.793l-2.147 2.146a.5.5 0 0 0 .708.708l3-3z"/></svg>`;
const IconLogout = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-box-arrow-left" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M6 12.5a.5.5 0 0 0 .5.5h8a.5.5 0 0 0 .5-.5v-9a.5.5 0 0 0-.5-.5h-8a.5.5 0 0 0-.5.5v2a.5.5 0 0 1-1 0v-2A1.5 1.5 0 0 1 6.5 2h8A1.5 1.5 0 0 1 16 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 5 12.5v-2a.5.5 0 0 1 1 0v2z"/><path fill-rule="evenodd" d="M.146 8.354a.5.5 0 0 1 0-.708l3-3a.5.5 0 1 1 .708.708L1.707 7.5H10.5a.5.5 0 0 1 0 1H1.707l2.147 2.146a.5.5 0 0 1-.708.708l-3-3z"/></svg>`;
const IconGithub = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-github" viewBox="0 0 16 16"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>`;
const IconShare = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-share" viewBox="0 0 16 16"><path d="M13.5 1a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM11 2.5a2.5 2.5 0 1 1 .603 1.628l-6.718 3.12a2.499 2.499 0 0 1 0 1.504l6.718 3.12a2.5 2.5 0 1 1-.488.876l-6.718-3.12a2.5 2.5 0 1 1 0-3.256l6.718-3.12A2.5 2.5 0 0 1 11 2.5zm-8.5 4a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z"/></svg>`;
const IconClipboard = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-clipboard" viewBox="0 0 16 16"><path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/><path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/></svg>`;


// --- 类型定义 ---
interface User {
  id: string; 
  githubId?: string;
  githubUsername?: string;
  githubAvatarUrl?: string;
  githubRegisteredAt?: string; 
  email?: string; // 新增用户邮箱字段
  linuxdoId?: number;
  linuxdoUsername?: string;
  linuxdoName?: string;
  linuxdoTrustLevel?: number;
  createdAt: string; 
  updatedAt: string; 
}

interface InvitationCode {
  id: string;
  createdBy: string;
  title: string; // 标题，必填
  description?: string; // 描述，可选
  type: "single-use" | "multi-use";
  providedCodes: string[]; 
  maxUsesPerCode: number; 
  currentUses: number; 
  assignedProvidedCodes?: Record<string, string>; 
  usageCountsForProvidedCodes?: Record<string, number>;
  eligibility: {
    githubMinRegistrationDays?: number;
    linuxdoMinTrustLevel?: number;
    isGithubCheckEnabled?: boolean;
    isLinuxdoCheckEnabled?: boolean;
  };
  distribution: {
    method: "instant" | "scheduled_random";
    drawTime?: string; // Stored as UTC ISO string
  };
  status: "active" | "inactive" | "drawn" | "expired" | "fully_claimed";
  createdAt: string;
  updatedAt: string;
}

interface Application {
  id: string; 
  codeId: string;
  userId: string;
  status: "pending" | "approved" | "rejected" | "awaiting_draw" | "cancelled"; 
  appliedAt: string;
  processedAt?: string;
  assignedCodeValue?: string; 
}

// --- 工具函数 ---
function generateUUID(): string {
  return crypto.randomUUID();
}

// --- 会话管理 ---
async function sign(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey( "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return `${value}.${btoa(String.fromCharCode(...new Uint8Array(signature)))}`;
}

async function verifyAndParse(signedValue: string, secret: string): Promise<string | null> {
  const parts = signedValue.split('.');
  if (parts.length !== 2) return null;
  const value = parts[0];
  const signatureToVerify = parts[1];
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const data = new TextEncoder().encode(value);
  const signature = Uint8Array.from(atob(signatureToVerify), c => c.charCodeAt(0));
  const valid = await crypto.subtle.verify("HMAC", key, signature, data);
  return valid ? value : null;
}

async function getSessionUser(req: Request): Promise<User | null> {
  const cookies = getCookies(req.headers);
  const signedSessionId = cookies[SESSION_COOKIE_NAME];
  if (!signedSessionId) return null;

  const sessionId = await verifyAndParse(signedSessionId, SESSION_SECRET_KEY);
  if (!sessionId) return null;

  const sessionRes = await kv.get<{ userId: string; expires: number; returnTo?: string }>(["sessions", sessionId]);
  if (!sessionRes.value || sessionRes.value.expires < Date.now()) {
    if (sessionRes.value) await kv.delete(["sessions", sessionId]); 
    return null;
  }

  const userRes = await kv.get<User>(["users", sessionRes.value.userId]);
  return userRes.value || null;
}


async function createSession(resHeaders: Headers, userId: string, returnTo?: string | null): Promise<void> {
  const sessionId = generateUUID();
  const expires = Date.now() + 7 * 24 * 60 * 60 * 1000; 
  
  const sessionData: { userId: string; expires: number; returnTo?: string } = { userId, expires };
  if (returnTo) {
    sessionData.returnTo = returnTo;
  }
  await kv.set(["sessions", sessionId], sessionData);

  const signedSessionId = await sign(sessionId, SESSION_SECRET_KEY);
  setCookie(resHeaders, {
    name: SESSION_COOKIE_NAME, value: signedSessionId, path: "/", httpOnly: true,
    secure: IS_HTTPS, sameSite: "Lax", expires: new Date(expires),
  });
}

async function getReturnToAfterLogin(req: Request): Promise<string | null> {
    const cookies = getCookies(req.headers);
    const signedSessionId = cookies[SESSION_COOKIE_NAME];
    if (!signedSessionId) return null;
    const sessionId = await verifyAndParse(signedSessionId, SESSION_SECRET_KEY);
    if (!sessionId) return null;

    const sessionRes = await kv.get<{ userId: string; expires: number; returnTo?: string }>(["sessions", sessionId]);
    if (sessionRes.value && sessionRes.value.returnTo) {
        const returnTo = sessionRes.value.returnTo;
        const updatedSession = { ...sessionRes.value };
        delete updatedSession.returnTo;
        await kv.set(["sessions", sessionId], updatedSession);
        return returnTo;
    }
    return null;
}


async function deleteSession(req: Request, resHeaders: Headers): Promise<void> {
  const cookies = getCookies(req.headers);
  const signedSessionId = cookies[SESSION_COOKIE_NAME];
  if (signedSessionId) {
    const sessionId = await verifyAndParse(signedSessionId, SESSION_SECRET_KEY);
    if (sessionId) await kv.delete(["sessions", sessionId]);
  }
  deleteCookie(resHeaders, SESSION_COOKIE_NAME, { path: "/" });
}

// --- OAuth 客户端初始化 ---
const githubOAuthClient = new OAuth2Client({
  clientId: GITHUB_CLIENT_ID, clientSecret: GITHUB_CLIENT_SECRET,
  authorizationEndpointUri: "https://github.com/login/oauth/authorize",
  tokenUri: "https://github.com/login/oauth/access_token",
  redirectUri: `${BASE_URL}/oauth/github/callback`,
  defaults: { scope: "read:user user:email" }, // user:email scope is needed for email
});

const linuxdoOAuthClient = new OAuth2Client({
  clientId: LINUXDO_CLIENT_ID, clientSecret: LINUXDO_CLIENT_SECRET,
  authorizationEndpointUri: LINUXDO_AUTHORIZE_URL, tokenUri: LINUXDO_TOKEN_URL,
  redirectUri: LINUXDO_REDIRECT_URI,
});

// --- 用户数据操作 ---
async function getUserByGithubId(githubId: string): Promise<User | null> {
  const internalIdRes = await kv.get<string>(["user_map_github", githubId]);
  if (!internalIdRes.value) return null;
  const userRes = await kv.get<User>(["users", internalIdRes.value]);
  return userRes.value || null;
}

async function getUserByLinuxdoId(linuxdoId: number): Promise<User | null> {
  const internalIdRes = await kv.get<string>(["user_map_linuxdo", String(linuxdoId)]);
  if (!internalIdRes.value) return null;
  const userRes = await kv.get<User>(["users", internalIdRes.value]);
  return userRes.value || null;
}

async function linkOrCreateUser(
    loggedInUser: User | null, 
    provider: "github" | "linuxdo",
    providerData: any,
    githubEmail?: string | null // Optional GitHub email
): Promise<User> {
    const now = new Date().toISOString();
    let userToUpdate: User | null = loggedInUser;

    if (!userToUpdate) { 
        if (provider === "github" && providerData.id) {
            userToUpdate = await getUserByGithubId(String(providerData.id));
        } else if (provider === "linuxdo" && providerData.id) {
            userToUpdate = await getUserByLinuxdoId(providerData.id);
        }
    }
    
    if (!userToUpdate) {
        userToUpdate = {
            id: generateUUID(),
            createdAt: now,
            updatedAt: now,
        };
    } else {
        userToUpdate.updatedAt = now;
    }

    if (provider === "github" && providerData.id) {
        userToUpdate.githubId = String(providerData.id);
        userToUpdate.githubUsername = providerData.login;
        userToUpdate.githubAvatarUrl = providerData.avatar_url;
        userToUpdate.githubRegisteredAt = providerData.created_at;
        if (githubEmail) { // Store email if provided
            userToUpdate.email = githubEmail;
        }
    } else if (provider === "linuxdo" && providerData.id) {
        userToUpdate.linuxdoId = providerData.id;
        userToUpdate.linuxdoUsername = providerData.username;
        userToUpdate.linuxdoName = providerData.name;
        if (userToUpdate.linuxdoTrustLevel !== providerData.trust_level) {
            console.log(`User ${userToUpdate.id} Linux.do trust level changed from ${userToUpdate.linuxdoTrustLevel} to ${providerData.trust_level}`);
            userToUpdate.linuxdoTrustLevel = providerData.trust_level;
        }
    }
    
    const atomicOp = kv.atomic();
    atomicOp.set(["users", userToUpdate.id], userToUpdate);
    if (userToUpdate.githubId) {
        atomicOp.set(["user_map_github", userToUpdate.githubId], userToUpdate.id);
    }
    if (userToUpdate.linuxdoId) {
        atomicOp.set(["user_map_linuxdo", String(userToUpdate.linuxdoId)], userToUpdate.id);
    }
    const commitResult = await atomicOp.commit();
    if (!commitResult.ok) {
        throw new Error("Failed to save user data during link or create.");
    }
    return userToUpdate;
}


// --- HTML 模板 (Bootstrap 5) ---
function HtmlLayout(title: string, content: string, user: User | null, globalMessage?: {type: 'success' | 'error', text: string}): string {
  let messageBannerHtml = '';
  if (globalMessage) {
    const bannerClass = globalMessage.type === 'success' ? 'alert-success' : 'alert-danger';
    messageBannerHtml = `
      <div id="global-message-banner" class="alert ${bannerClass} alert-dismissible fade show position-fixed top-0 start-0 end-0 z-index-master rounded-0 mb-0" role="alert" style="transform: translateY(-100%); transition: transform 0.3s ease-out;">
        ${globalMessage.text}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
      </div>
      <script>
        document.addEventListener('DOMContentLoaded', () => {
          const banner = document.getElementById('global-message-banner');
          if (banner) {
            setTimeout(() => {
              banner.style.transform = 'translateY(0)';
              setTimeout(() => {
                var bsAlert = new bootstrap.Alert(banner);
                if (bsAlert) {
                  banner.style.transform = 'translateY(-100%)';
                  setTimeout(() => { banner.remove(); }, 300);
                } else { 
                  banner.style.transform = 'translateY(-100%)';
                  setTimeout(() => { banner.remove(); }, 300);
                }
              }, 3500);
            }, 100);
          }
        });
      </script>
    `;
  }

  return `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title} - 邀请码分发平台</title>
      <link href="https://use.sevencdn.com/npm/bootstrap@5/dist/css/bootstrap.min.css" rel="stylesheet">
      <link href="https://use.sevencdn.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
      <style>
        body { 
          font-family: 'Inter', sans-serif; 
          background-color: #f8f9fa;
          padding-top: 72px; 
        }
        .navbar {
          background-color: rgba(255, 255, 255, 0.95) !important;
          backdrop-filter: blur(10px);
          box-shadow: 0 0.125rem 0.25rem rgba(0,0,0,.075) !important;
          min-height: 56px;
        }
        .card {
          border: none;
          box-shadow: 0 0.5rem 1rem rgba(0,0,0,.1) !important; 
          border-radius: 0.5rem; 
        }
        .btn {
          border-radius: 0.375rem; 
        }
        .btn-primary {
            background-color: #0d6efd; 
            border-color: #0d6efd;
        }
        .btn-primary:hover {
            background-color: #0b5ed7;
            border-color: #0a58ca;
        }
        .btn-danger {
            background-color: #dc3545;
            border-color: #dc3545;
        }
        .btn-danger:hover {
            background-color: #bb2d3b;
            border-color: #b02a37;
        }
        .z-index-master { z-index: 1056; }
        .form-check-input:checked {
            background-color: #0d6efd;
            border-color: #0d6efd;
        }
        .hover-shadow-lg:hover {
            box-shadow: 0 1rem 3rem rgba(0,0,0,.175)!important;
        }
        .transition-shadow {
            transition: box-shadow .3s ease-in-out;
        }
      </style>
    </head>
    <body class="d-flex flex-column min-vh-100">
      ${messageBannerHtml}
      <nav class="navbar navbar-expand-lg fixed-top py-2">
        <div class="container-fluid">
          <a class="navbar-brand fw-bold fs-4 text-primary" href="/">邀请码分发平台</a>
          <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav" aria-controls="navbarNav" aria-expanded="false" aria-label="Toggle navigation">
            <span class="navbar-toggler-icon"></span>
          </button>
          <div class="collapse navbar-collapse" id="navbarNav">
            <ul class="navbar-nav ms-auto align-items-center">
              ${user ? `
                ${user.githubAvatarUrl ? `<li class="nav-item d-none d-sm-block"><img src="${user.githubAvatarUrl}" alt="${user.githubUsername || '用户头像'}" class="rounded-circle" style="width: 32px; height: 32px; margin-right: 8px;"></li>` : ''}
                <li class="nav-item"><span class="nav-link text-muted d-none d-md-inline">欢迎, ${user.githubUsername || user.linuxdoName || '用户'}!</span></li>
                <li class="nav-item"><a class="btn btn-outline-secondary btn-sm me-2" href="/dashboard">仪表盘</a></li>
                <li class="nav-item">
                  <form action="/logout" method="post" class="d-inline">
                     <button type="submit" class="btn btn-outline-secondary btn-sm d-flex align-items-center">${IconLogout} <span class="ms-1">登出</span></button>
                  </form>
                </li>
              ` : `
                <li class="nav-item"><a class="btn btn-primary d-flex align-items-center" href="/login">${IconLogin} <span class="ms-1">登录</span></a></li>
              `}
            </ul>
          </div>
        </div>
      </nav>
      
      <main class="container flex-grow-1 py-4">
        ${content}
      </main>

      <footer class="py-4 mt-auto bg-light text-muted text-center border-top">
        <p class="mb-1">&copy; ${new Date().getFullYear()} Invite Code Release Platform.</p>
        <p class="mb-0">Built by Deno.</p>
      </footer>

      <script src="https://use.sevencdn.com/npm/bootstrap@5/dist/js/bootstrap.bundle.min.js"></script>
      <script>
        function copyToClipboard(text, buttonElement) {
          navigator.clipboard.writeText(text).then(() => {
            const originalText = buttonElement.innerHTML;
            buttonElement.innerHTML = '已复制!';
            buttonElement.classList.remove('btn-outline-secondary');
            buttonElement.classList.add('btn-success');
            setTimeout(() => {
              buttonElement.innerHTML = originalText;
              buttonElement.classList.remove('btn-success');
              buttonElement.classList.add('btn-outline-secondary');
            }, 1500);
          }).catch(err => {
            console.error('无法复制到剪贴板: ', err);
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            try {
              document.execCommand('copy');
              const originalText = buttonElement.innerHTML;
              buttonElement.innerHTML = '已复制!';
              buttonElement.classList.remove('btn-outline-secondary');
              buttonElement.classList.add('btn-success');
              setTimeout(() => {
                buttonElement.innerHTML = originalText;
                buttonElement.classList.remove('btn-success');
                buttonElement.classList.add('btn-outline-secondary');
              }, 1500);
            } catch (fallbackErr) {
              console.error('回退复制失败: ', fallbackErr);
              alert('无法复制到剪贴板');
            }
            document.body.removeChild(textarea);
          });
        }
      </script>
    </body>
    </html>
  `;
}

function LoginPage(error?: string, githubLoginUrl?: string, linuxdoLoginUrl?: string): string {
  const ghUrl = githubLoginUrl || "/login/github"; 
  const ldUrl = linuxdoLoginUrl || "/login/linuxdo"; 

  return `
    <div class="row justify-content-center mt-lg-5">
      <div class="col-lg-5 col-md-7">
        <div class="card shadow-lg border-0 rounded-lg">
          <div class="card-body p-4 p-sm-5">
            ${error ? `<div class="alert alert-danger mb-4" role="alert">${error}</div>` : ''}
            <h2 class="card-title text-center fw-bold h3 mb-4">选择登录方式</h2>
            <div class="d-grid gap-3">
              <a href="${ghUrl}" class="btn btn-dark btn-lg d-flex align-items-center justify-content-center">
                ${IconGithub} <span class="ms-2">使用 GitHub 登录</span>
              </a>
              <a href="${ldUrl}" class="btn btn-success btn-lg d-flex align-items-center justify-content-center">
                <span class="fw-bold fs-5 me-2">L</span> 使用 Linux.do 登录
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function DashboardPage(user: User, codes: InvitationCode[], applications: Application[]): string {
  const userCodes = codes.filter(c => c.createdBy === user.id);

  return `
    <div class="row g-4">
      <div class="col-lg-4 col-xl-3">
        <div class="card mb-4">
          <div class="card-header bg-light fw-bold">我的信息</div>
          <div class="card-body">
            <p class="card-text small"><strong class="d-block text-muted">用户 ID:</strong> <code class="user-select-all">${user.id}</code></p>
            ${user.email ? `<p class="card-text small"><strong class="d-block text-muted">邮箱:</strong> ${user.email}</p>` : ''}
            ${user.githubUsername ? `<p class="card-text small"><strong class="d-block text-muted">GitHub:</strong> ${user.githubUsername} (注册于: ${user.githubRegisteredAt ? new Date(user.githubRegisteredAt).toLocaleDateString() : 'N/A'})</p>` : ''}
            ${user.linuxdoUsername ? `<p class="card-text small"><strong class="d-block text-muted">Linux.do:</strong> ${user.linuxdoUsername} (等级: ${user.linuxdoTrustLevel ?? 'N/A'})</p>` : ''}
            <div class="mt-3">
              ${!user.githubId ? `<a href="/login/github" class="btn btn-link btn-sm p-0">关联 GitHub 账户 &rarr;</a><br>` : ''}
              ${!user.linuxdoId ? `<a href="/login/linuxdo" class="btn btn-link btn-sm p-0">关联 Linux.do 账户 &rarr;</a>` : ''}
            </div>
          </div>
        </div>
        <div class="d-grid">
           <a href="/apply" class="btn btn-primary btn-lg d-flex align-items-center justify-content-center">${IconPlus} <span class="ms-1">查看并申请邀请码</span></a>
        </div>
      </div>

      <div class="col-lg-8 col-xl-9">
        <section class="mb-5">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h2 class="h4 fw-bold mb-0">我创建的邀请码</h2>
            <a href="/codes/new" class="btn btn-primary btn-sm d-flex align-items-center">${IconPlus} <span class="ms-1">创建新邀请码</span></a>
          </div>
          ${userCodes.length === 0 ? '<div class="card card-body text-center text-muted py-4"><p>您还没有创建任何邀请码。</p></div>' : `
            <div class="list-group">
              ${userCodes.map(code => {
                const shareUrl = `${BASE_URL}/c/${code.id}`;
                let displayCodeInfo = '';
                if (code.providedCodes && code.providedCodes.length > 0) {
                    displayCodeInfo = `码列表: ${code.providedCodes.length} 个`;
                     if (code.providedCodes.length === 1) {
                        displayCodeInfo = `码值: <code class="bg-light px-1 rounded user-select-all">${code.providedCodes[0]}</code>`;
                    }
                }

                let usesText = `${code.currentUses}/`;
                if (code.type === 'single-use') { 
                    usesText += code.providedCodes.length;
                } else { // multi-use
                    if (code.maxUsesPerCode === 0) usesText += '无限制';
                    else usesText += (code.providedCodes.length * code.maxUsesPerCode);
                }
                
                const statusBadgeClass = code.status === 'active' ? 'bg-success' : 
                                  code.status === 'fully_claimed' ? 'bg-info' :
                                  code.status === 'drawn' ? 'bg-warning text-dark' :
                                  code.status === 'expired' ? 'bg-danger' : 'bg-secondary';
                return `
                <div class="list-group-item list-group-item-action flex-column align-items-start p-3 mb-2 rounded-3 shadow-sm">
                  <div class="d-flex w-100 justify-content-between">
                    <h5 class="mb-1 fw-semibold text-primary">${code.title}</h5>
                    <small class="text-muted">创建于: ${new Date(code.createdAt).toLocaleDateString()}</small>
                  </div>
                  ${code.description ? `<p class="mb-1 small text-muted">${code.description}</p>` : ''}
                  <p class="mb-1 small text-muted">ID: ${code.id}</p>
                  <div class="mb-1 small">
                    类型: <span class="fw-medium">${code.type === 'single-use' ? '一次性' : '多次使用'}</span>, 状态: <span class="badge ${statusBadgeClass}">${code.status}</span>
                  </div>
                  <p class="mb-1 small">已用/总名额: <span class="fw-medium">${usesText}</span></p>
                  ${displayCodeInfo ? `<p class="mb-1 small">${displayCodeInfo}</p>`: ''}
                  <div class="mt-2 d-flex flex-wrap gap-2">
                     <button type="button" onclick="copyToClipboard('${shareUrl}', this)" class="btn btn-outline-secondary btn-sm d-inline-flex align-items-center">
                       ${IconClipboard} <span class="ms-1 d-none d-sm-inline">复制分享链接</span>
                     </button>
                     <form action="/codes/delete/${code.id}" method="post" class="d-inline">
                       <button type="submit" class="btn btn-outline-danger btn-sm d-inline-flex align-items-center" onclick="return confirm('确定要删除这个邀请码吗？相关的申请记录也会被删除。');">
                         ${IconTrash} <span class="ms-1 d-none d-sm-inline">删除</span>
                       </button>
                     </form>
                  </div>
                </div>`;
              }).join('')}
            </div>
          `}
        </section>

        <section>
          <h2 class="h4 fw-bold mb-3">我申请的邀请码</h2>
          ${applications.length === 0 ? '<div class="card card-body text-center text-muted py-4"><p>您还没有申请任何邀请码。</p></div>' : `
            <div class="list-group">
              ${applications.map(app => {
                const relatedCode = codes.find(c => c.id === app.codeId); 
                const appStatusBadgeClass = app.status === 'approved' ? 'bg-success' : 
                                     app.status === 'awaiting_draw' ? 'bg-warning text-dark' :
                                     app.status === 'rejected' ? 'bg-danger' :
                                     app.status === 'cancelled' ? 'bg-secondary' : 'bg-light text-dark';
                return `
                <div class="list-group-item list-group-item-action flex-column align-items-start p-3 mb-2 rounded-3 shadow-sm">
                  <h5 class="mb-1 fw-semibold text-primary">${relatedCode?.title || '未知邀请码'}</h5>
                  ${relatedCode?.description ? `<p class="mb-1 small text-muted">${relatedCode.description}</p>` : ''}
                  <div class="mb-1 small">状态: <span class="badge ${appStatusBadgeClass}">${app.status}</span></div>
                  ${app.assignedCodeValue ? `<p class="mb-1 small">获得的码值: <code class="bg-light px-1 rounded user-select-all">${app.assignedCodeValue}</code></p>` : ''}
                  <small class="text-muted">申请于: ${new Date(app.appliedAt).toLocaleString()}</small>
                </div>`;
              }).join('')}
            </div>
          `}
        </section>
      </div>
    </div>
  `;
}

function CreateCodePage(user: User, error?: string, formData?: any): string {
  const defaultGithubCheck = formData === undefined || formData?.isGithubCheckEnabled === 'on';
  const defaultLinuxdoCheck = formData === undefined || formData?.isLinuxdoCheckEnabled === 'on';
  const currentType = formData?.type || 'single-use';
  const currentDistMethod = formData?.distributionMethod || 'instant';

  return `
    ${error ? `<div class="alert alert-danger mb-4" role="alert">${error}</div>` : ''}
    <div class="row justify-content-center">
      <div class="col-lg-8 col-xl-7">
        <div class="card">
          <div class="card-body p-4 p-sm-5">
            <form method="POST" action="/codes/new" class="needs-validation" novalidate>
              <div class="mb-4">
                <label for="title" class="form-label fw-semibold">邀请码标题:</label>
                <input type="text" name="title" id="title" class="form-control form-control-lg" value="${formData?.title || ''}" required placeholder="例如：春季特惠活动">
                <div class="invalid-feedback">请输入标题。</div>
              </div>
              <div class="mb-4">
                <label for="description" class="form-label fw-semibold">邀请码描述 (可选):</label>
                <textarea name="description" id="description" class="form-control" rows="2" placeholder="例如：仅限新用户，有效期至月底">${formData?.description || ''}</textarea>
              </div>
              
              <div class="mb-4">
                <label for="codeValuesInput" class="form-label fw-semibold">邀请码值 (每行一个):</label>
                <textarea name="codeValuesInput" id="codeValuesInput" class="form-control" rows="4" placeholder="CODE-ALPHA\nCODE-BETA\nCODE-GAMMA" required>${formData?.codeValuesInput || ''}</textarea>
                <div class="invalid-feedback">请输入至少一个邀请码。</div>
              </div>

              <div class="row g-3 mb-4">
                <div class="col-md-6">
                  <label for="type" class="form-label fw-semibold">类型:</label>
                  <select name="type" id="type" class="form-select form-select-lg">
                    <option value="single-use" ${currentType === 'single-use' ? 'selected' : ''}>一次性使用 (每个码用一次)</option>
                    <option value="multi-use" ${currentType === 'multi-use' ? 'selected' : ''}>多次使用 (每个码可用多次)</option>
                  </select>
                </div>
                <div class="col-md-6" id="maxUsesDiv" style="${currentType === 'multi-use' ? '' : 'display: none;'}">
                  <label for="maxUsesPerCode" class="form-label fw-semibold">每个码可使用次数:</label>
                  <input type="number" name="maxUsesPerCode" id="maxUsesPerCode" class="form-control form-control-lg" value="${formData?.maxUsesPerCode || '0'}" min="0">
                  <div class="form-text small">仅当类型为“多次使用”时有效。0 代表无限制。</div>
                </div>
              </div>
              
              <fieldset class="mb-4 p-3 border rounded-3">
                <legend class="h6 fw-semibold mb-3">资格条件</legend>
                <div class="form-check mb-3 p-3 bg-light rounded">
                  <input type="checkbox" name="isGithubCheckEnabled" id="isGithubCheckEnabled" class="form-check-input" ${defaultGithubCheck ? 'checked' : ''}>
                  <label for="isGithubCheckEnabled" class="form-check-label fw-medium">启用 GitHub 资格校验</label>
                  <div class="mt-2 ps-4">
                    <label for="githubMinRegistrationDays" class="form-label form-label-sm">GitHub 注册天数 (最少):</label>
                    <input type="number" name="githubMinRegistrationDays" id="githubMinRegistrationDays" class="form-control form-control-sm w-auto d-inline-block" value="${formData?.githubMinRegistrationDays || '180'}" min="0" placeholder="例如: 180">
                  </div>
                </div>
                <div class="form-check p-3 bg-light rounded">
                  <input type="checkbox" name="isLinuxdoCheckEnabled" id="isLinuxdoCheckEnabled" class="form-check-input" ${defaultLinuxdoCheck ? 'checked' : ''}>
                  <label for="isLinuxdoCheckEnabled" class="form-check-label fw-medium">启用 Linux.do 资格校验</label>
                  <div class="mt-2 ps-4">
                    <label for="linuxdoMinTrustLevel" class="form-label form-label-sm">Linux.do 最低等级:</label>
                    <input type="number" name="linuxdoMinTrustLevel" id="linuxdoMinTrustLevel" class="form-control form-control-sm w-auto d-inline-block" min="0" value="${formData?.linuxdoMinTrustLevel || '2'}" placeholder="例如: 2">
                  </div>
                </div>
              </fieldset>

              <fieldset class="mb-4 p-3 border rounded-3">
                <legend class="h6 fw-semibold mb-3">分发方式</legend>
                <div class="mb-3">
                  <label for="distributionMethod" class="form-label fw-semibold">方式:</label>
                  <select name="distributionMethod" id="distributionMethod" class="form-select">
                    <option value="instant" ${currentDistMethod === 'instant' ? 'selected' : ''}>满足条件即时发送</option>
                    <option value="scheduled_random" ${currentDistMethod === 'scheduled_random' ? 'selected' : ''}>定时随机抽取</option>
                  </select>
                </div>
                <div id="drawTimeDiv" style="${currentDistMethod === 'scheduled_random' ? '' : 'display: none;'}">
                  <label for="drawTime" class="form-label fw-semibold">抽取时间 (UTC+8):</label>
                  <input type="datetime-local" name="drawTime" id="drawTime" class="form-control" value="${formData?.drawTime || ''}">
                  <div class="form-text small">请按您所在时区（将视为 UTC+8）输入。</div>
                </div>
              </fieldset>
              <div class="d-grid">
                <button type="submit" class="btn btn-primary btn-lg d-flex align-items-center justify-content-center">${IconPlus} <span class="ms-1">创建邀请码</span></button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
    <script>
      (function () {
        'use strict'
        var forms = document.querySelectorAll('.needs-validation')
        Array.prototype.slice.call(forms)
          .forEach(function (form) {
            form.addEventListener('submit', function (event) {
              if (!form.checkValidity()) {
                event.preventDefault()
                event.stopPropagation()
              }
              form.classList.add('was-validated')
            }, false)
          });

        const typeSelect = document.getElementById('type');
        const maxUsesDiv = document.getElementById('maxUsesDiv');
        const maxUsesInput = document.getElementById('maxUsesPerCode');
        const distributionMethodSelect = document.getElementById('distributionMethod');
        const drawTimeDiv = document.getElementById('drawTimeDiv');
        const drawTimeInput = document.getElementById('drawTime');

        function toggleMaxUses() {
          if (typeSelect.value === 'multi-use') {
            maxUsesDiv.style.display = '';
            maxUsesInput.required = true; 
          } else {
            maxUsesDiv.style.display = 'none';
            maxUsesInput.required = false;
            // maxUsesInput.value = '1'; // No longer needed to set value, backend handles single-use logic
          }
        }

        function toggleDrawTime() {
          if (distributionMethodSelect.value === 'scheduled_random') {
            drawTimeDiv.style.display = '';
            drawTimeInput.required = true;
          } else {
            drawTimeDiv.style.display = 'none';
            drawTimeInput.required = false;
          }
        }

        typeSelect.addEventListener('change', toggleMaxUses);
        distributionMethodSelect.addEventListener('change', toggleDrawTime);

        toggleMaxUses(); // Initial call
        toggleDrawTime(); // Initial call
      })();
    </script>
  `;
}

function ApplyListPage(user: User, availableCodes: InvitationCode[], globalMessage?: { type: 'success' | 'error', text: string }): string {
  return `
    ${availableCodes.length === 0 ? `
      <div class="card text-center text-muted py-5">
        <div class="card-body">
          <h3 class="card-title h4">当前没有可申请的邀请码。</h3>
          <p class="card-text">请稍后再来看看！</p>
        </div>
      </div>` : `
      <div class="row row-cols-1 row-cols-md-2 row-cols-xl-3 g-4">
        ${availableCodes.map(code => {
          let remainingText = "";
          if (code.type === 'single-use') {
              remainingText = `名额: ${code.providedCodes.length - code.currentUses} / ${code.providedCodes.length}`;
          } else { // multi-use
            if (code.maxUsesPerCode === 0) {
              remainingText = `每个码无限制次数 / 共 ${code.providedCodes.length} 个码`;
            } else {
              const totalSlots = code.providedCodes.length * code.maxUsesPerCode;
              remainingText = `总名额: ${totalSlots - code.currentUses} / ${totalSlots}`;
            }
          }
          const shareUrl = `${BASE_URL}/c/${code.id}`;

          return `
          <div class="col">
            <div class="card h-100 shadow-sm hover-shadow-lg transition-shadow">
              <div class="card-body d-flex flex-column">
                <h5 class="card-title fw-bold text-primary mb-2">${code.title}</h5>
                ${code.description ? `<p class="card-text small text-muted mb-2">${code.description}</p>` : ''}
                <div class="small text-muted mb-3">
                  <p class="mb-1">类型: <span class="fw-medium">${code.type === 'single-use' ? '一次性' : '多次使用'}</span></p>
                  <p class="mb-1">分发: <span class="fw-medium">${code.distribution.method === 'instant' ? '即时' : '定时抽取'}</span></p>
                  <p class="mb-1">${remainingText}</p>
                  ${code.eligibility.isGithubCheckEnabled && code.eligibility.githubMinRegistrationDays ? `<p class="mb-0 text-secondary"><small>GitHub注册需满: ${code.eligibility.githubMinRegistrationDays} 天</small></p>` : ''}
                  ${code.eligibility.isLinuxdoCheckEnabled && code.eligibility.linuxdoMinTrustLevel !== undefined ? `<p class="mb-0 text-secondary"><small>Linux.do等级需达到: ${code.eligibility.linuxdoMinTrustLevel}</small></p>` : ''}
                  ${code.distribution.method === 'scheduled_random' && code.distribution.drawTime ? `<p class="mb-0 text-secondary"><small>抽取时间 (UTC): ${new Date(code.distribution.drawTime).toLocaleString('zh-CN', { timeZone: 'UTC', hour12: false })}</small></p>` : ''}
                </div>
                <div class="mt-auto d-grid gap-2">
                    <form method="POST" action="/apply/${code.id}">
                      <button type="submit" class="btn btn-primary w-100">立即申请</button>
                    </form>
                    <a href="${shareUrl}" target="_blank" class="btn btn-outline-secondary btn-sm w-100 d-flex align-items-center justify-content-center">
                      ${IconShare} <span class="ms-1">分享此邀请码</span>
                    </a>
                </div>
              </div>
            </div>
          </div>
        `}).join('')}
      </div>
    `}
  `;
}

function PublicCodePage(code: InvitationCode, user: User | null, message?: {type: 'success' | 'error', text: string}): string {
    let remainingText = "";
    if (code.type === 'single-use') {
        remainingText = `可用名额: ${code.providedCodes.length - code.currentUses} / ${code.providedCodes.length}`;
    } else { // multi-use
        if (code.maxUsesPerCode === 0) {
            remainingText = `每个码无限制次数 / 共 ${code.providedCodes.length} 个码`;
        } else {
            const totalSlots = code.providedCodes.length * code.maxUsesPerCode;
            remainingText = `总可用名额: ${totalSlots - code.currentUses} / ${totalSlots}`;
        }
    }

    const isFullyClaimed = (code.type === 'single-use' && code.currentUses >= code.providedCodes.length) ||
                           (code.type === 'multi-use' && code.maxUsesPerCode !== 0 && code.currentUses >= (code.providedCodes.length * code.maxUsesPerCode));

    return `
        <div class="row justify-content-center">
            <div class="col-lg-7 col-md-9">
                ${message ? `<div class="alert alert-${message.type === 'success' ? 'success' : 'danger'} mb-4" role="alert">${message.text}</div>` : ''}
                <div class="card shadow-lg">
                    <div class="card-body p-4 p-sm-5">
                        <h2 class="card-title h3 fw-bold text-primary mb-2">${code.title}</h2>
                        ${code.description ? `<p class="card-text text-muted mb-3">${code.description}</p>` : ''}
                        <p class="card-subtitle mb-1 text-muted small">由 ${code.createdBy === user?.id ? '您' : '用户 ' + code.createdBy.substring(0,8) + '...'} 创建</p>
                        <p class="card-subtitle mb-4 text-muted small">创建于: ${new Date(code.createdAt).toLocaleDateString()}</p>

                        <div class="mb-4">
                            <p class="mb-1"><strong>类型:</strong> ${code.type === 'single-use' ? '一次性使用' : '多次使用'}</p>
                            <p class="mb-1"><strong>分发方式:</strong> ${code.distribution.method === 'instant' ? '即时发送' : '定时随机抽取'}</p>
                            <p class="mb-1"><strong>${remainingText}</strong></p>
                            ${code.distribution.method === 'scheduled_random' && code.distribution.drawTime ? `<p class="mb-0"><strong>抽取时间 (UTC):</strong> ${new Date(code.distribution.drawTime).toLocaleString('zh-CN', { timeZone: 'UTC', hour12: false })}</p>` : ''}
                        </div>

                        ${(code.eligibility.isGithubCheckEnabled && code.eligibility.githubMinRegistrationDays) || (code.eligibility.isLinuxdoCheckEnabled && code.eligibility.linuxdoMinTrustLevel !== undefined) ? `
                        <div class="mb-4 p-3 bg-light border rounded">
                            <h4 class="h6 fw-semibold mb-2">申请资格:</h4>
                            <ul class="list-unstyled small text-dark">
                                ${code.eligibility.isGithubCheckEnabled && code.eligibility.githubMinRegistrationDays ? `<li class="mb-1"><span class="badge bg-secondary me-1">GitHub</span> 注册需满 ${code.eligibility.githubMinRegistrationDays} 天</li>` : ''}
                                ${code.eligibility.isLinuxdoCheckEnabled && code.eligibility.linuxdoMinTrustLevel !== undefined ? `<li><span class="badge bg-success me-1">Linux.do</span> 等级需达到 ${code.eligibility.linuxdoMinTrustLevel}</li>` : ''}
                            </ul>
                        </div>
                        ` : ''}

                        ${code.status !== 'active' || isFullyClaimed ? `
                            <div class="alert alert-warning text-center" role="alert">
                                此邀请码当前 ${isFullyClaimed ? '已领完' : '不可用或已过期'}。
                            </div>
                        ` : (user ? `
                            <form method="POST" action="/apply/${code.id}" class="d-grid">
                                <button type="submit" class="btn btn-primary btn-lg">立即申请此邀请码</button>
                            </form>
                        ` : `
                            <div class="d-grid">
                                <a href="/login?returnTo=/c/${code.id}" class="btn btn-primary btn-lg d-flex align-items-center justify-content-center">${IconLogin} <span class="ms-2">登录后申请</span></a>
                            </div>
                        `)}
                    </div>
                </div>
            </div>
        </div>
    `;
}


// --- 核心逻辑函数 ---
async function checkEligibility(user: User, code: InvitationCode): Promise<boolean> {
  if (code.eligibility.isGithubCheckEnabled) {
    if (!user.githubRegisteredAt || code.eligibility.githubMinRegistrationDays === undefined) {
      console.log(`Eligibility fail: GitHub check enabled but user data or code setting missing. User GH Registered: ${user.githubRegisteredAt}, Code Days: ${code.eligibility.githubMinRegistrationDays}`);
      return false; 
    }
    const registrationDate = new Date(user.githubRegisteredAt);
    const now = new Date();
    const diffTime = now.getTime() - registrationDate.getTime(); 
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays < code.eligibility.githubMinRegistrationDays) {
      console.log(`Eligibility fail: GitHub registration days not met. User days: ${diffDays}, Required: ${code.eligibility.githubMinRegistrationDays}`);
      return false; 
    }
  }

  if (code.eligibility.isLinuxdoCheckEnabled) {
    if (user.linuxdoTrustLevel === undefined || user.linuxdoTrustLevel === null || code.eligibility.linuxdoMinTrustLevel === undefined) {
      console.log(`Eligibility fail: Linux.do check enabled but user data or code setting missing. User Level: ${user.linuxdoTrustLevel}, Code Level: ${code.eligibility.linuxdoMinTrustLevel}`);
      return false; 
    }
    if (user.linuxdoTrustLevel < code.eligibility.linuxdoMinTrustLevel) {
      console.log(`Eligibility fail: Linux.do trust level not met. User Level: ${user.linuxdoTrustLevel}, Required: ${code.eligibility.linuxdoMinTrustLevel}`);
      return false; 
    }
  }
  return true;
}


// --- 路由处理 ---
const router: Record<string, (req: Request, params?: Record<string, string>, user?: User | null) => Promise<Response>> = {
  "GET /": async (req, params, user) => {
    if (!user) return Response.redirect(`${BASE_URL}/login`, 302);
    return Response.redirect(`${BASE_URL}/dashboard`, 302);
  },
  "GET /login": async (req, params, user) => {
    if (user) return Response.redirect(`${BASE_URL}/dashboard`, 302);
    const url = new URL(req.url);
    const error = url.searchParams.get('error');
    const returnTo = url.searchParams.get('returnTo'); 

    const loginState = generateUUID(); 
    await kv.set(["oauth_login_state", loginState], { returnTo: returnTo || "/dashboard" }, { expireIn: 5 * 60 * 1000 });
    
    const githubLoginUrl = new URL(`${BASE_URL}/login/github`);
    githubLoginUrl.searchParams.set("state_for_return", loginState);
    const linuxdoLoginUrl = new URL(`${BASE_URL}/login/linuxdo`);
    linuxdoLoginUrl.searchParams.set("state_for_return", loginState);

    return new Response(HtmlLayout("登录", LoginPage(error || undefined, githubLoginUrl.toString(), linuxdoLoginUrl.toString()), user), { 
        headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  },
  "POST /logout": async (req, params, user) => { 
    const headers = new Headers();
    if (user) {
      await deleteSession(req, headers);
    }
    headers.set("Location", `${BASE_URL}/login`);
    return new Response(null, { status: 302, headers });
  },
  "GET /login/github": async (req) => {
    const url = new URL(req.url);
    const loginState = url.searchParams.get("state_for_return"); 
    let returnTo = "/dashboard";
    if (loginState) {
        const stateData = await kv.get<{returnTo?: string}>(["oauth_login_state", loginState]);
        if (stateData.value?.returnTo) returnTo = stateData.value.returnTo;
    }

    const oauthProviderState = generateUUID(); 
    await kv.set(["oauth_provider_state", oauthProviderState], { provider: "github", returnTo: returnTo }, { expireIn: 5 * 60 * 1000 });
    const { uri, codeVerifier } = await githubOAuthClient.code.getAuthorizationUri({ state: oauthProviderState });
    await kv.set(["oauth_code_verifier", oauthProviderState], { codeVerifier }, { expireIn: 5 * 60 * 1000 }); 
    return Response.redirect(uri.toString(), 302);
  },
  "GET /oauth/github/callback": async (req) => {
    const url = new URL(req.url);
    const state = url.searchParams.get("state"); 
    const code = url.searchParams.get("code");
    if (!state || !code) return Response.redirect(`${BASE_URL}/login?error=Invalid_GitHub_Callback`, 302);

    const storedProviderStateRes = await kv.get<{ provider: string, returnTo?: string }>(["oauth_provider_state", state]);
    const storedCodeVerifierRes = await kv.get<{codeVerifier?: string}>(["oauth_code_verifier", state]);
    
    await kv.delete(["oauth_provider_state", state]); 
    await kv.delete(["oauth_code_verifier", state]);

    if (!storedProviderStateRes.value || storedProviderStateRes.value.provider !== "github" || !storedCodeVerifierRes.value?.codeVerifier) {
      return Response.redirect(`${BASE_URL}/login?error=Invalid_State_or_Verifier`, 302);
    }
    
    try {
      const tokens = await githubOAuthClient.code.getToken(req.url, { codeVerifier: storedCodeVerifierRes.value.codeVerifier });
      const githubUserResponse = await fetch("https://api.github.com/user", { headers: { Authorization: `Bearer ${tokens.accessToken}` } });
      if (!githubUserResponse.ok) throw new Error(`Failed to fetch GitHub user info: ${githubUserResponse.status}`);
      const githubData = await githubUserResponse.json();

      // Fetch user emails
      let primaryEmail: string | null = null;
      const emailsResponse = await fetch("https://api.github.com/user/emails", {
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
      });
      if (emailsResponse.ok) {
          const emailsData = await emailsResponse.json();
          const primary = emailsData.find((e: any) => e.primary);
          if (primary) primaryEmail = primary.email;
          else if (emailsData.length > 0) primaryEmail = emailsData[0].email; // Fallback to first email
      } else {
          console.warn("Could not fetch GitHub user emails:", emailsResponse.status);
      }
      
      const loggedInUser = await getSessionUser(req); 
      const user = await linkOrCreateUser(loggedInUser, "github", githubData, primaryEmail);
      
      const headers = new Headers();
      await createSession(headers, user.id, storedProviderStateRes.value.returnTo); 
      
      const finalRedirectUrl = storedProviderStateRes.value.returnTo || `${BASE_URL}/dashboard`;
      headers.set("Location", finalRedirectUrl.startsWith("/") ? `${BASE_URL}${finalRedirectUrl}` : finalRedirectUrl);
      return new Response(null, { status: 302, headers });

    } catch (error) {
      console.error("GitHub OAuth Error:", error);
      return Response.redirect(`${BASE_URL}/login?error=GitHub_OAuth_Failed&details=${encodeURIComponent(error.message)}`, 302);
    }
  },
 "GET /login/linuxdo": async (req) => {
    const url = new URL(req.url);
    const loginState = url.searchParams.get("state_for_return");
    let returnTo = "/dashboard";
    if (loginState) {
        const stateData = await kv.get<{returnTo?: string}>(["oauth_login_state", loginState]);
        if (stateData.value?.returnTo) returnTo = stateData.value.returnTo;
    }
    
    const oauthProviderState = generateUUID(); 
    await kv.set(["oauth_provider_state", oauthProviderState], { provider: "linuxdo", returnTo: returnTo }, { expireIn: 5 * 60 * 1000 });

    const authUrl = new URL(LINUXDO_AUTHORIZE_URL);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", LINUXDO_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", LINUXDO_REDIRECT_URI);
    authUrl.searchParams.set("state", oauthProviderState);
    return Response.redirect(authUrl.toString(), 302);
  },
  "GET /oauth2/callback": async (req) => { 
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state"); 
    if (!code || !state) return Response.redirect(`${BASE_URL}/login?error=Invalid_LinuxDO_Callback`, 302);

    const storedProviderStateRes = await kv.get<{ provider: string, returnTo?: string }>(["oauth_provider_state", state]);
    await kv.delete(["oauth_provider_state", state]); 
    
    if (!storedProviderStateRes.value || storedProviderStateRes.value.provider !== "linuxdo") {
      return Response.redirect(`${BASE_URL}/login?error=Invalid_State_LinuxDO`, 302);
    }

    try {
      const tokenResponse = await fetch(LINUXDO_TOKEN_URL, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code", code: code, redirect_uri: LINUXDO_REDIRECT_URI,
          client_id: LINUXDO_CLIENT_ID, client_secret: LINUXDO_CLIENT_SECRET,
        }),
      });
      if (!tokenResponse.ok) {
        const errorBody = await tokenResponse.text();
        throw new Error(`Failed to get Linux.do token: ${tokenResponse.status} ${errorBody}`);
      }
      const tokens = await tokenResponse.json();
      const userInfoResponse = await fetch(LINUXDO_USER_INFO_URL, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
      if (!userInfoResponse.ok) throw new Error(`Failed to fetch Linux.do user info: ${userInfoResponse.status}`);
      const linuxdoData = await userInfoResponse.json();

      const loggedInUser = await getSessionUser(req); 
      const user = await linkOrCreateUser(loggedInUser, "linuxdo", linuxdoData);
      
      const headers = new Headers();
      await createSession(headers, user.id, storedProviderStateRes.value.returnTo);
      
      const finalRedirectUrl = storedProviderStateRes.value.returnTo || `${BASE_URL}/dashboard`;
      headers.set("Location", finalRedirectUrl.startsWith("/") ? `${BASE_URL}${finalRedirectUrl}` : finalRedirectUrl);
      return new Response(null, { status: 302, headers });
    } catch (error) {
      console.error("Linux.do OAuth Error:", error);
      return Response.redirect(`${BASE_URL}/login?error=LinuxDO_OAuth_Failed&details=${encodeURIComponent(error.message)}`, 302);
    }
  },
  "GET /dashboard": async (req, params, user) => {
    if (!user) return Response.redirect(`${BASE_URL}/login?error=Session_Expired`, 302);
    const codesIter = kv.list<InvitationCode>({ prefix: ["invitation_codes"] });
    const allCodes: InvitationCode[] = [];
    for await (const entry of codesIter) allCodes.push(entry.value);
    
    const userApplications: Application[] = [];
    const userAppIter = kv.list<Application>({ prefix: ["applications_by_user", user.id] });
    for await (const appEntry of userAppIter) {
        userApplications.push(appEntry.value);
    }
    
    const url = new URL(req.url);
    const messageType = url.searchParams.get('messageType') as 'success' | 'error' | null;
    const messageText = url.searchParams.get('messageText');
    let globalMessage: { type: 'success' | 'error', text: string } | undefined;
    if (messageType && messageText) {
        globalMessage = { type: messageType, text: decodeURIComponent(messageText) };
    }

    return new Response(HtmlLayout("仪表盘", DashboardPage(user, allCodes, userApplications), user, globalMessage), { headers: { "Content-Type": "text/html; charset=utf-8" } });
  },
  "GET /codes/new": async (req, params, user) => {
    if (!user) return Response.redirect(`${BASE_URL}/login`, 302);
    return new Response(HtmlLayout("创建新邀请码", CreateCodePage(user), user), { headers: { "Content-Type": "text/html; charset=utf-8" } });
  },
  "POST /codes/new": async (req, params, user) => {
    if (!user) return Response.redirect(`${BASE_URL}/login`, 302);
    const formData = await req.formData();
    const title = formData.get("title") as string; 
    const description = formData.get("description") as string || undefined; 
    const type = formData.get("type") as "single-use" | "multi-use";
    const codeValuesInputRaw = formData.get("codeValuesInput") as string;
    const providedCodesList = codeValuesInputRaw.split('\n').map(c => c.trim()).filter(c => c.length > 0);
    
    let maxUsesPerCodeInput = 1; 
    if (type === 'multi-use') {
        const maxUsesStr = formData.get("maxUsesPerCode") as string;
        maxUsesPerCodeInput = parseInt(maxUsesStr, 10);
        if (isNaN(maxUsesPerCodeInput) || maxUsesPerCodeInput < 0) maxUsesPerCodeInput = 0; 
    }

    const isGithubCheckEnabled = formData.get("isGithubCheckEnabled") === "on";
    const githubMinRegistrationDaysStr = formData.get("githubMinRegistrationDays") as string;
    const githubMinRegistrationDays = isGithubCheckEnabled && githubMinRegistrationDaysStr ? parseInt(githubMinRegistrationDaysStr, 10) : undefined;
    const isLinuxdoCheckEnabled = formData.get("isLinuxdoCheckEnabled") === "on";
    const linuxdoMinTrustLevelStr = formData.get("linuxdoMinTrustLevel") as string;
    const linuxdoMinTrustLevel = isLinuxdoCheckEnabled && linuxdoMinTrustLevelStr ? parseInt(linuxdoMinTrustLevelStr, 10) : undefined;
    const distributionMethod = formData.get("distributionMethod") as "instant" | "scheduled_random";
    const drawTimeStr = formData.get("drawTime") as string;
    
    let drawTime: string | undefined = undefined;
    if (distributionMethod === "scheduled_random" && drawTimeStr) {
        try {
            const dateInUTC8 = new Date(drawTimeStr + "+08:00"); 
            drawTime = dateInUTC8.toISOString(); 
        } catch (e) {
            console.error("Invalid date format for drawTime:", drawTimeStr, e);
            return new Response(HtmlLayout("创建新邀请码", CreateCodePage(user, "抽奖时间格式无效。", Object.fromEntries(formData)), user, {type: 'error', text: "抽奖时间格式无效。"}), { status:400, headers: { "Content-Type": "text/html; charset=utf-8" } });
        }
    }


    if (!title || !type ) return new Response(HtmlLayout("创建新邀请码", CreateCodePage(user, "标题和类型为必填项。", Object.fromEntries(formData)), user, {type: 'error', text: "标题和类型为必填项。"}), { status:400, headers: { "Content-Type": "text/html; charset=utf-8" } });
    if (providedCodesList.length === 0) return new Response(HtmlLayout("创建新邀请码", CreateCodePage(user, "必须提供至少一个邀请码值。", Object.fromEntries(formData)), user, {type: 'error', text: "必须提供至少一个邀请码值。"}), { status:400, headers: { "Content-Type": "text/html; charset=utf-8" } });
    if (distributionMethod === "scheduled_random" && !drawTime) return new Response(HtmlLayout("创建新邀请码", CreateCodePage(user, "定时抽取必须指定抽取时间。", Object.fromEntries(formData)), user, {type: 'error', text: "定时抽取必须指定抽取时间。"}), { status:400, headers: { "Content-Type": "text/html; charset=utf-8" } });
    if (isGithubCheckEnabled && (githubMinRegistrationDays === undefined || githubMinRegistrationDays < 0)) return new Response(HtmlLayout("创建新邀请码", CreateCodePage(user, "启用了GitHub校验，但注册天数无效。", Object.fromEntries(formData)),user, {type: 'error', text: "启用了GitHub校验，但注册天数无效。"}), { status:400, headers: { "Content-Type": "text/html; charset=utf-8" } });
    if (isLinuxdoCheckEnabled && (linuxdoMinTrustLevel === undefined || linuxdoMinTrustLevel < 0)) return new Response(HtmlLayout("创建新邀请码", CreateCodePage(user, "启用了Linux.do校验，但等级无效。", Object.fromEntries(formData)), user, {type: 'error', text: "启用了Linux.do校验，但等级无效。"}), { status:400, headers: { "Content-Type": "text/html; charset=utf-8" } });
    if (type === 'multi-use' && (formData.get("maxUsesPerCode") === null || maxUsesPerCodeInput < 0) ) { 
        return new Response(HtmlLayout("创建新邀请码", CreateCodePage(user, "多次使用类型必须指定每个码可使用次数 (0代表无限)。", Object.fromEntries(formData)), user, {type: 'error', text: "多次使用类型必须指定每个码可使用次数 (0代表无限)。"}), { status:400, headers: { "Content-Type": "text/html; charset=utf-8" } });
    }


    const newCode: InvitationCode = {
      id: generateUUID(), createdBy: user.id, title, description, type,
      providedCodes: providedCodesList,
      maxUsesPerCode: maxUsesPerCodeInput, 
      currentUses: 0,
      eligibility: { isGithubCheckEnabled, githubMinRegistrationDays, isLinuxdoCheckEnabled, linuxdoMinTrustLevel },
      distribution: { method: distributionMethod, drawTime },
      status: "active", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };

    if (type === "single-use") {
      newCode.assignedProvidedCodes = {};
    } else { 
      newCode.usageCountsForProvidedCodes = {};
    }

    await kv.set(["invitation_codes", newCode.id], newCode);
    const redirectUrl = new URL(`${BASE_URL}/dashboard`);
    redirectUrl.searchParams.set("messageType", "success");
    redirectUrl.searchParams.set("messageText", encodeURIComponent("邀请码创建成功！"));
    return Response.redirect(redirectUrl.toString(), 302);
  },
  "POST /codes/delete/:codeId": async (req, params, user) => {
    if (!user) return Response.redirect(`${BASE_URL}/login`, 302);
    const codeId = params!.codeId;
    const codeRes = await kv.get<InvitationCode>(["invitation_codes", codeId]);

    if (!codeRes.value || codeRes.value.createdBy !== user.id) {
      const redirectUrl = new URL(`${BASE_URL}/dashboard`);
      redirectUrl.searchParams.set("messageType", "error");
      redirectUrl.searchParams.set("messageText", encodeURIComponent("无法删除此邀请码：未找到或权限不足。"));
      return Response.redirect(redirectUrl.toString(), 302);
    }

    const atomicOp = kv.atomic();
    atomicOp.delete(["invitation_codes", codeId]);
    const appsByCodeIter = kv.list<Application>({ prefix: ["applications_by_code", codeId] });
    for await (const appEntry of appsByCodeIter) {
        atomicOp.delete(appEntry.key); 
        atomicOp.delete(["applications", appEntry.value.userId, codeId]);
        atomicOp.delete(["applications_by_user", appEntry.value.userId, codeId]); 
    }
    await atomicOp.commit();
    
    const redirectUrl = new URL(`${BASE_URL}/dashboard`);
    redirectUrl.searchParams.set("messageType", "success");
    redirectUrl.searchParams.set("messageText", encodeURIComponent("邀请码已成功删除。"));
    return Response.redirect(redirectUrl.toString(), 302);
  },
  "GET /c/:codeId": async (req, params, user) => {
    const codeId = params!.codeId;
    const codeRes = await kv.get<InvitationCode>(["invitation_codes", codeId]);
    const url = new URL(req.url);
    const messageType = url.searchParams.get('messageType') as 'success' | 'error' | null;
    const messageText = url.searchParams.get('messageText');
    let pageMessage: { type: 'success' | 'error', text: string } | undefined;
    if (messageType && messageText) {
        pageMessage = { type: messageType, text: decodeURIComponent(messageText) };
    }

    if (!codeRes.value) {
        return new Response(HtmlLayout("邀请码未找到", `<div class="card text-center py-5"><p class="h3 fw-bold text-danger">邀请码不存在</p><p class="mt-3 text-muted">您访问的邀请码链接无效或已被删除。</p><a href="/" class="btn btn-primary mt-4">返回首页</a></div>`, user, {type: 'error', text: '邀请码未找到'}), { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    return new Response(HtmlLayout(`邀请码: ${codeRes.value.title}`, PublicCodePage(codeRes.value, user, pageMessage), user, pageMessage), { headers: { "Content-Type": "text/html; charset=utf-8" } });
  },
  "GET /apply": async (req, params, user) => {
    if (!user) return Response.redirect(`${BASE_URL}/login?returnTo=/apply`, 302);
    const url = new URL(req.url);
    const messageType = url.searchParams.get('messageType') as 'success' | 'error' | null;
    const messageText = url.searchParams.get('messageText');
    let globalMessage: { type: 'success' | 'error', text: string } | undefined;
    if (messageType && messageText) globalMessage = { type: messageType, text: decodeURIComponent(messageText) };

    const codesIter = kv.list<InvitationCode>({ prefix: ["invitation_codes"] });
    const availableCodes: InvitationCode[] = [];
    for await (const entry of codesIter) {
      const code = entry.value;
      if (code.status !== "active") continue;
      let isAvailable = false;
      if (code.type === "single-use") {
          isAvailable = code.currentUses < code.providedCodes.length;
      } else { // multi-use
          if (code.maxUsesPerCode === 0) isAvailable = true; // Unlimited
          else isAvailable = code.currentUses < (code.providedCodes.length * code.maxUsesPerCode);
      }
      if (isAvailable) availableCodes.push(code);
    }
    return new Response(HtmlLayout("申请邀请码", ApplyListPage(user, availableCodes, globalMessage), user, globalMessage), { headers: { "Content-Type": "text/html; charset=utf-8" } });
  },
  "POST /apply/:codeId": async (req, params, user) => {
    const codeId = params!.codeId;
    const returnUrlForApplyPage = `${BASE_URL}/c/${codeId}`; 

    if (!user) {
        const loginRedirectUrl = new URL(`${BASE_URL}/login`);
        loginRedirectUrl.searchParams.set("returnTo", `${BASE_URL}/c/${codeId}`);
        return Response.redirect(loginRedirectUrl.toString(), 302);
    }

    const codeRes = await kv.get<InvitationCode>(["invitation_codes", codeId]);
    if (!codeRes.value) {
        const redirectUrl = new URL(returnUrlForApplyPage);
        redirectUrl.searchParams.set("messageType", "error");
        redirectUrl.searchParams.set("messageText", encodeURIComponent("邀请码不存在"));
        return Response.redirect(redirectUrl.toString(), 302);
    }
    
    let code = codeRes.value; 
    let maxPossibleUses = 0;
    if (code.type === "single-use") {
        maxPossibleUses = code.providedCodes.length;
    } else { // multi-use
        maxPossibleUses = code.maxUsesPerCode === 0 ? Infinity : code.providedCodes.length * code.maxUsesPerCode;
    }

    if (code.status !== "active" || (maxPossibleUses !== Infinity && code.currentUses >= maxPossibleUses)) {
        const redirectUrl = new URL(returnUrlForApplyPage);
        redirectUrl.searchParams.set("messageType", "error");
        redirectUrl.searchParams.set("messageText", encodeURIComponent("邀请码无效或已领完"));
        return Response.redirect(redirectUrl.toString(), 302);
    }
    
    const existingApplicationRes = await kv.get<Application>(["applications", user.id, codeId]); 
    if (existingApplicationRes.value && (existingApplicationRes.value.status === 'approved' || existingApplicationRes.value.status === 'awaiting_draw')) {
        const redirectUrl = new URL(returnUrlForApplyPage);
        redirectUrl.searchParams.set("messageType", "error");
        redirectUrl.searchParams.set("messageText", encodeURIComponent("您已申请过此邀请码或正在等待抽取"));
        return Response.redirect(redirectUrl.toString(), 302);
    }

    const eligible = await checkEligibility(user, code);
    if (!eligible) {
        const redirectUrl = new URL(returnUrlForApplyPage);
        redirectUrl.searchParams.set("messageType", "error");
        redirectUrl.searchParams.set("messageText", encodeURIComponent("您不满足此邀请码的申请条件"));
        return Response.redirect(redirectUrl.toString(), 302);
    }

    const application: Application = {
      id: generateUUID(), codeId, userId: user.id,
      status: code.distribution.method === "instant" ? "approved" : "awaiting_draw", 
      appliedAt: new Date().toISOString(),
    };

    let successMessage = "申请成功！";
    let codeAssignedThisAttempt = false;

    if (code.distribution.method === "instant") {
      if (code.type === "single-use") {
        code.assignedProvidedCodes = code.assignedProvidedCodes || {};
        for (const specificCode of code.providedCodes) {
          if (!code.assignedProvidedCodes[specificCode]) {
            application.assignedCodeValue = specificCode; code.assignedProvidedCodes[specificCode] = user.id;
            codeAssignedThisAttempt = true; break;
          }
        }
      } else { // multi-use
        code.usageCountsForProvidedCodes = code.usageCountsForProvidedCodes || {};
        for (const specificCode of code.providedCodes) {
          const currentSpecificUses = code.usageCountsForProvidedCodes[specificCode] || 0;
          if (code.maxUsesPerCode === 0 || currentSpecificUses < code.maxUsesPerCode) {
            application.assignedCodeValue = specificCode;
            code.usageCountsForProvidedCodes[specificCode] = currentSpecificUses + 1;
            codeAssignedThisAttempt = true;
            break;
          }
        }
      }

      if (codeAssignedThisAttempt) {
        code.currentUses += 1; application.status = "approved"; application.processedAt = new Date().toISOString();
        successMessage = `申请成功！您的邀请码是: ${application.assignedCodeValue}`;
      } else {
        application.status = "pending"; successMessage = "暂时无可用邀请码，请稍后再试或等待补货。";
        const redirectUrl = new URL(returnUrlForApplyPage);
        redirectUrl.searchParams.set("messageType", "error");
        redirectUrl.searchParams.set("messageText", encodeURIComponent(successMessage));
        return Response.redirect(redirectUrl.toString(), 302);
      }
    } else { 
      successMessage = "已加入抽奖队列！请等待开奖。";
    }
    
    let currentTotalMaxUses = 0;
    if (code.type === "single-use") currentTotalMaxUses = code.providedCodes.length;
    else currentTotalMaxUses = code.maxUsesPerCode === 0 ? Infinity : code.providedCodes.length * code.maxUsesPerCode;
    
    if (currentTotalMaxUses !== Infinity && code.currentUses >= currentTotalMaxUses) code.status = "fully_claimed";
    code.updatedAt = new Date().toISOString();

    const atomicOp = kv.atomic();
    atomicOp.set(["invitation_codes", codeId], code);
    atomicOp.set(["applications", user.id, codeId], application); 
    atomicOp.set(["applications_by_code", codeId, user.id], application); 
    atomicOp.set(["applications_by_user", user.id, codeId], application); 

    const commitResult = await atomicOp.commit();

    const finalRedirectUrl = new URL(returnUrlForApplyPage);
    if (!commitResult.ok) {
        finalRedirectUrl.searchParams.set("messageType", "error");
        finalRedirectUrl.searchParams.set("messageText", encodeURIComponent("申请失败，请重试"));
    } else {
        finalRedirectUrl.searchParams.set("messageType", "success");
        finalRedirectUrl.searchParams.set("messageText", encodeURIComponent(successMessage));
    }
    return Response.redirect(finalRedirectUrl.toString(), 302);
  },
};

// --- Cron 任务 ---
Deno.cron("process_scheduled_draws", "*/5 * * * *", async () => {
  console.log(`[CRON ${new Date().toISOString()}] Processing scheduled draws...`);
  const nowISO = new Date().toISOString(); 
  const codesIter = kv.list<InvitationCode>({ prefix: ["invitation_codes"] });
  
  const emailsToSend: { from: string; to: string[]; subject: string; html: string; }[] = [];

  for await (const entry of codesIter) {
    let code = entry.value; 
    if (code.status !== "active" || code.distribution.method !== "scheduled_random" || !code.distribution.drawTime || new Date(code.distribution.drawTime) > new Date(nowISO)) continue; 
    
    let maxPossibleUsesForCron = 0;
    if (code.type === "single-use") maxPossibleUsesForCron = code.providedCodes.length;
    else maxPossibleUsesForCron = code.maxUsesPerCode === 0 ? Infinity : code.providedCodes.length * code.maxUsesPerCode;

    if (maxPossibleUsesForCron !== Infinity && code.currentUses >= maxPossibleUsesForCron) {
      if (code.status !== "fully_claimed") {
        console.log(`[CRON] Code ${code.id} (${code.title}) already fully claimed before draw. Updating status.`);
        code.status = "fully_claimed"; code.updatedAt = nowISO;
        await kv.set(["invitation_codes", code.id], code);
      }
      continue;
    }
    console.log(`[CRON] Drawing for code: ${code.id} (${code.title})`);
    const applicantsIter = kv.list<Application>({ prefix: ["applications_by_code", code.id] });
    const eligibleApplicants: Application[] = [];
    for await (const appEntry of applicantsIter) if (appEntry.value.status === "awaiting_draw") eligibleApplicants.push(appEntry.value);
    if (eligibleApplicants.length === 0) {
      console.log(`[CRON] No eligible applicants for code ${code.id} (${code.title}). Marking as drawn.`);
      code.status = "drawn"; code.updatedAt = nowISO;
      await kv.set(["invitation_codes", code.id], code);
      continue;
    }
    
    let numToAward = 0;
    if (code.type === "single-use") {
        numToAward = code.providedCodes.length - code.currentUses;
    } else { // multi-use
        numToAward = code.maxUsesPerCode === 0 ? eligibleApplicants.length : (code.providedCodes.length * code.maxUsesPerCode) - code.currentUses;
    }
    numToAward = Math.min(eligibleApplicants.length, numToAward);

    if (numToAward <=0) {
      console.log(`[CRON] No slots to award for code ${code.id} (${code.title}).`);
      code.status = "drawn"; code.updatedAt = nowISO;
      await kv.set(["invitation_codes", code.id], code);
      continue;
    }
    for (let i = eligibleApplicants.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [eligibleApplicants[i], eligibleApplicants[j]] = [eligibleApplicants[j], eligibleApplicants[i]];
    }
    const winners = eligibleApplicants.slice(0, numToAward);
    const losers = eligibleApplicants.slice(numToAward);
    const atomicOp = kv.atomic();
    let codesAssignedInDraw = 0;

    for (const winnerApp of winners) {
      let assignedThisWinner = false;
      if (code.type === "single-use") {
        code.assignedProvidedCodes = code.assignedProvidedCodes || {};
        for (const specificCode of code.providedCodes) { 
          if (!code.assignedProvidedCodes[specificCode]) { 
            winnerApp.assignedCodeValue = specificCode; 
            code.assignedProvidedCodes[specificCode] = winnerApp.userId; 
            assignedThisWinner = true; 
            break;
          }
        }
      } else { // multi-use
        code.usageCountsForProvidedCodes = code.usageCountsForProvidedCodes || {};
        for (const specificCode of code.providedCodes) {
          const currentSpecificUses = code.usageCountsForProvidedCodes[specificCode] || 0;
          if (code.maxUsesPerCode === 0 || currentSpecificUses < code.maxUsesPerCode) {
            winnerApp.assignedCodeValue = specificCode;
            code.usageCountsForProvidedCodes[specificCode] = currentSpecificUses + 1;
            assignedThisWinner = true;
            break;
          }
        }
      }
      if (assignedThisWinner) {
        winnerApp.status = "approved"; winnerApp.processedAt = nowISO;
        atomicOp.set(["applications", winnerApp.userId, code.id], winnerApp);
        atomicOp.set(["applications_by_code", code.id, winnerApp.userId], winnerApp);
        atomicOp.set(["applications_by_user", winnerApp.userId, code.id], winnerApp); 
        codesAssignedInDraw++;
        console.log(`[CRON] User ${winnerApp.userId} won code ${code.id} (${code.title}). Assigned: ${winnerApp.assignedCodeValue}`);
        
        // Prepare email for this winner
        const userRes = await kv.get<User>(["users", winnerApp.userId]);
        if (userRes.value && userRes.value.email && RESEND_API_KEY && RESEND_SENDER_EMAIL) {
            emailsToSend.push({
                from: RESEND_SENDER_EMAIL,
                to: [userRes.value.email],
                subject: `恭喜！您获得了邀请码: ${code.title}`,
                html: `
                    <h1>恭喜您！</h1>
                    <p>您成功申请并获得了邀请码 <strong>${code.title}</strong>。</p>
                    <p>您的邀请码是: <strong><code>${winnerApp.assignedCodeValue}</code></strong></p>
                    ${code.description ? `<p>邀请码描述: ${code.description}</p>` : ''}
                    <p>感谢您的参与！</p>
                    <p><a href="${BASE_URL}/dashboard">前往仪表盘查看</a></p>
                `
            });
        } else {
            console.warn(`[CRON] Could not send email to user ${winnerApp.userId} for code ${code.id}: User email or Resend config missing.`);
        }

      } else {
        winnerApp.status = "rejected"; winnerApp.processedAt = nowISO; 
        atomicOp.set(["applications", winnerApp.userId, code.id], winnerApp);
        atomicOp.set(["applications_by_code", code.id, winnerApp.userId], winnerApp);
        atomicOp.set(["applications_by_user", winnerApp.userId, code.id], winnerApp); 
        console.log(`[CRON] User ${winnerApp.userId} was selected for code ${code.id} (${code.title}) but no specific code could be assigned.`);
      }
    }
    for (const loserApp of losers) {
      loserApp.status = "rejected"; loserApp.processedAt = nowISO;
      atomicOp.set(["applications", loserApp.userId, code.id], loserApp);
      atomicOp.set(["applications_by_code", code.id, loserApp.userId], loserApp);
      atomicOp.set(["applications_by_user", loserApp.userId, code.id], loserApp); 
    }
    code.currentUses += codesAssignedInDraw;
    
    let finalMaxUses = 0;
    if (code.type === "single-use") finalMaxUses = code.providedCodes.length;
    else finalMaxUses = code.maxUsesPerCode === 0 ? Infinity : code.providedCodes.length * code.maxUsesPerCode;

    if (finalMaxUses !== Infinity && code.currentUses >= finalMaxUses) code.status = "fully_claimed";
    else code.status = "drawn"; 
    code.updatedAt = nowISO;
    atomicOp.set(["invitation_codes", code.id], code);
    const commitResult = await atomicOp.commit();
    if (commitResult.ok) console.log(`[CRON] Draw for code ${code.id} (${code.title}) completed. ${codesAssignedInDraw} winners out of ${winners.length} selected.`);
    else console.error(`[CRON] Failed to commit draw results for code ${code.id} (${code.title}).`);
  }

  // Send batch email if there are emails to send
  if (emailsToSend.length > 0 && RESEND_API_KEY && RESEND_SENDER_EMAIL) {
    try {
        console.log(`[CRON] Sending ${emailsToSend.length} emails via Resend...`);
        const resendResponse = await fetch('https://api.resend.com/emails/batch', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(emailsToSend)
        });
        if (resendResponse.ok) {
            const responseData = await resendResponse.json();
            console.log('[CRON] Resend batch email response:', responseData);
        } else {
            const errorData = await resendResponse.text();
            console.error('[CRON] Resend API error:', resendResponse.status, errorData);
        }
    } catch (emailError) {
        console.error('[CRON] Error sending emails via Resend:', emailError);
    }
  }


  console.log(`[CRON ${new Date().toISOString()}] Finished processing draws.`);
});

// --- 主服务器逻辑 ---
serve(async (req: Request) => {
  const url = new URL(req.url);
  const user = await getSessionUser(req);
  for (const routePattern in router) {
    const pattern = new URLPattern({ pathname: routePattern.split(" ")[1] });
    if (req.method === routePattern.split(" ")[0] && pattern.test(url)) {
      const params = pattern.exec(url)?.pathname.groups;
      try {
        return await router[routePattern](req, params, user);
      } catch (e) {
        console.error("Error handling request:", req.method, req.url, e);
        const errorMessage = IS_HTTPS ? "服务器发生内部错误，请稍后再试。" : `处理您的请求时发生错误: ${e.message}.`;
        return new Response(HtmlLayout("服务器错误", `<div class="alert alert-danger" role="alert">${errorMessage}</div>`, user, {type: 'error', text: '服务器内部错误'}), { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
    }
  }
  return new Response(HtmlLayout("404 - 页面未找到", `<div class="card text-center py-5"><h3 class="h2 fw-bold text-danger">哎呀！页面飞走了</h3><p class="mt-3 text-muted fs-5">您所访问的页面不存在，或已被移动。</p><a href="/" class="btn btn-primary btn-lg mt-4">返回首页</a></div>`, user), { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } });
}, { port: Number(Deno.env.get("PORT") || 8181) }); 

console.log(`Server running. Access it at: ${BASE_URL}`);
console.log(`Ensure your BASE_URL environment variable is set correctly if deploying.`);
console.log(`Defaulting to https://invite.deno.dev if BASE_URL is not set.`);
console.log(`OAuth callback URLs are configured based on this BASE_URL:`);
console.log(`  - Linux.do Redirect URI: ${LINUXDO_REDIRECT_URI}`);
console.log(`  - GitHub Redirect URI: ${BASE_URL}/oauth/github/callback`);
if (RESEND_API_KEY && RESEND_SENDER_EMAIL) {
    console.log("Resend email notifications are configured.");
} else {
    console.warn("Resend API Key or Sender Email not configured. Email notifications for winners will be disabled.");
}