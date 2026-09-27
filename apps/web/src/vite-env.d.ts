/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the Why This Match API, e.g. `http://127.0.0.1:4000`. */
  readonly VITE_API_URL?: string;
  /** Milliseconds before an API request is abandoned. */
  readonly VITE_API_TIMEOUT_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
