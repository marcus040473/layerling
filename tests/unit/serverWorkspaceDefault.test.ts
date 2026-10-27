import { describe, expect, it } from "vitest";
import { pushWorkspaceDefaultToServer, syncWorkspaceDefaultWithServer } from "@/lib/serverWorkspaceDefault";
import { readWorkspaceDefault, saveWorkspaceDefault, normalizeWorkspaceSettings, WORKSPACE_DEFAULT_STORAGE_KEY } from "@/lib/workplaneSettings";

/* "Make default" between a browser and the server store: the store's wins, a browser's goes up when the store has none. */

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, String(value)); },
  };
}

/** A store that keeps what it is sent; `answer` replaces it for a store that is off or broken. */
function fakeStore(initial: unknown = null, answer?: () => Response) {
  const store = { settings: initial as unknown, posts: 0 };
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    if (answer) return answer();
    if (init?.method === "POST") {
      store.posts += 1;
      store.settings = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ saved: true }));
    }
    return new Response(JSON.stringify({ enabled: true, settings: store.settings }));
  }) as typeof fetch;
  return { store, fetchImpl };
}

describe("the default in the server store", () => {
  it("brings the store's default into a browser that has none", async () => {
    const storage = memoryStorage();
    const { fetchImpl } = fakeStore({ workspace: { ...normalizeWorkspaceSettings(undefined), showShadows: false }, snap: "0.5 mm" });

    expect(await syncWorkspaceDefaultWithServer(storage, fetchImpl)).toBe("pulled");
    const local = readWorkspaceDefault(storage);
    expect(local?.workspace.showShadows).toBe(false);
    expect(local?.snap).toBe("0.5 mm");
  });

  it("lets the store's default win over the browser's", async () => {
    const storage = memoryStorage();
    saveWorkspaceDefault({ ...normalizeWorkspaceSettings(undefined), showShadows: true }, "1.0 mm", storage);
    const { store, fetchImpl } = fakeStore({ workspace: { showShadows: false }, snap: "0.5 mm" });

    expect(await syncWorkspaceDefaultWithServer(storage, fetchImpl)).toBe("pulled");
    expect(readWorkspaceDefault(storage)?.workspace.showShadows).toBe(false);
    expect(store.posts).toBe(0);
  });

  it("sends the browser's default up when the store has none yet", async () => {
    const storage = memoryStorage();
    saveWorkspaceDefault({ ...normalizeWorkspaceSettings(undefined), showShadows: false }, "0.5 mm", storage);
    const { store, fetchImpl } = fakeStore(null);

    expect(await syncWorkspaceDefaultWithServer(storage, fetchImpl)).toBe("pushed");
    expect(store.settings).toMatchObject({ workspace: { showShadows: false }, snap: "0.5 mm" });
  });

  it("leaves the browser alone without a store, or when the store fails", async () => {
    const storage = memoryStorage();
    saveWorkspaceDefault({ ...normalizeWorkspaceSettings(undefined), showShadows: false }, "0.5 mm", storage);
    const before = storage.getItem(WORKSPACE_DEFAULT_STORAGE_KEY);

    for (const answer of [
      () => new Response(JSON.stringify({ enabled: false, projects: [] })),
      () => new Response("broken", { status: 500 }),
      () => { throw new Error("offline"); },
    ]) {
      expect(await syncWorkspaceDefaultWithServer(storage, fakeStore(null, answer).fetchImpl)).toBe("none");
    }
    expect(storage.getItem(WORKSPACE_DEFAULT_STORAGE_KEY)).toBe(before);
  });

  it("has nothing to send from a browser without a default", async () => {
    const { store, fetchImpl } = fakeStore(null);
    expect(await pushWorkspaceDefaultToServer(memoryStorage(), fetchImpl)).toBe(false);
    expect(await syncWorkspaceDefaultWithServer(memoryStorage(), fetchImpl)).toBe("none");
    expect(store.posts).toBe(0);
  });
});
