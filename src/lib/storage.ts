const AUTH_KEYS = ["viewer_token", "agent_id", "expires_at"] as const;

export type AuthState = {
  viewer_token: string;
  agent_id: string;
  expires_at?: string | null;
};

export async function getAuth(): Promise<AuthState | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(AUTH_KEYS, (result) => {
      const viewer_token = result.viewer_token as string | undefined;
      const agent_id = result.agent_id as string | undefined;
      const expires_at = (result.expires_at as string | undefined) ?? null;
      if (!viewer_token || !agent_id) {
        resolve(null);
        return;
      }
      resolve({ viewer_token, agent_id, expires_at });
    });
  });
}

export async function setAuth(auth: AuthState): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set(
      {
        viewer_token: auth.viewer_token,
        agent_id: auth.agent_id,
        expires_at: auth.expires_at ?? null
      },
      () => resolve()
    );
  });
}

export async function clearAuth(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove(AUTH_KEYS, () => resolve());
  });
}
