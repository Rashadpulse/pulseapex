// src/config/api.ts

/**
 * PulseApex Centralized API Configuration
 * 
 * Automatically resolves the correct backend API and WebSocket URLs
 * for both local development and production Vercel environments.
 */

// 1. Primary API URL
// Priority:
// - NEXT_PUBLIC_API_URL
// - NEXT_PUBLIC_BACKEND_URL (legacy)
// - Fallback to http://localhost:8000/api/v1
export const API_BASE_URL = 
  process.env.NEXT_PUBLIC_API_URL || 
  process.env.NEXT_PUBLIC_BACKEND_URL || 
  "http://localhost:8000/api/v1";

// Helper to ensure WebSocket URL has the correct /ws path
const ensureWsPath = (url: string) => {
  if (!url.endsWith("/ws")) {
    return url.replace(/\/$/, "") + "/ws";
  }
  return url;
};

// Helper to derive wsUrl dynamically from backendUrl if not explicitly provided
const deriveWsUrl = (backend: string) => {
  if (backend.includes("localhost") || backend.includes("127.0.0.1")) {
    return backend.replace("http://", "ws://").replace("/api/v1", "/ws");
  }
  return backend.replace("https://", "wss://").replace("http://", "ws://").replace("/api/v1", "/ws");
};

// 2. Primary WebSocket URL
// Priority:
// - NEXT_PUBLIC_WS_URL (ensures /ws is appended)
// - Derives automatically from API_BASE_URL (http -> ws, https -> wss)
const rawWsUrl = process.env.NEXT_PUBLIC_WS_URL;
export const WS_BASE_URL = rawWsUrl 
  ? ensureWsPath(rawWsUrl) 
  : deriveWsUrl(API_BASE_URL);
