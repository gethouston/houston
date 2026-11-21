import { WORKTREE_PORT_STRIDE, worktreePortOffset } from "@houston/fake-host";

export const WEB_PORT = Number(
  process.env.HOUSTON_E2E_WEB_PORT ||
    20000 + worktreePortOffset() * WORKTREE_PORT_STRIDE,
);
export const WEB_URL = `http://localhost:${WEB_PORT}`;

export const BOOT_TIMEOUT = 20_000;

export const AUTH_WEB_PORT = WEB_PORT + 5;
export const AUTH_WEB_URL = `http://localhost:${AUTH_WEB_PORT}`;

export const FAKE_FIREBASE_API_KEY = "AIzaSyE2E-fake-key-for-signin-spec-00000";
