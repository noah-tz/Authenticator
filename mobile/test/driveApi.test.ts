import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDriveApi,
  DriveAuth,
  DriveError,
  SYNC_FILE_NAME,
} from "../../src/models/driveApi";

function fakeAuth(tokens: string[]) {
  const dropped: string[] = [];
  const auth: DriveAuth = {
    getToken: vi.fn(async () => tokens.shift() as string),
    dropToken: vi.fn(async (t: string) => {
      dropped.push(t);
    }),
  };
  return { auth, dropped };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createDriveApi", () => {
  it("findFile queries the appDataFolder space by name", async () => {
    const fetchMock = vi.fn(async () => json({ files: [{ id: "f1" }] }));
    vi.stubGlobal("fetch", fetchMock);
    const { auth } = fakeAuth(["t1"]);
    const file = await createDriveApi(auth).findFile();
    expect(file).toEqual({ id: "f1" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("spaces=appDataFolder");
    expect(url).toContain(encodeURIComponent(`name='${SYNC_FILE_NAME}'`));
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer t1"
    );
  });

  it("findFile returns null when there is no file", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ files: [] })));
    const { auth } = fakeAuth(["t1"]);
    expect(await createDriveApi(auth).findFile()).toBeNull();
  });

  it("a 401 drops the token and retries once with a new one", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json({ files: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const { auth, dropped } = fakeAuth(["old", "new"]);
    await createDriveApi(auth).findFile();
    expect(dropped).toEqual(["old"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const second = fetchMock.mock.calls[1][1] as RequestInit;
    expect((second.headers as Record<string, string>).Authorization).toBe(
      "Bearer new"
    );
  });

  it("a second 401 fails instead of looping", async () => {
    const fetchMock = vi.fn(async () => json({}, 401));
    vi.stubGlobal("fetch", fetchMock);
    const { auth } = fakeAuth(["a", "b"]);
    await expect(createDriveApi(auth).findFile()).rejects.toMatchObject({
      code: "HTTP",
      status: 401,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("HTTP error detail redacts access tokens", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("bad Bearer ya29.A0secret-token_1 and ya29.zzz.yyy", {
            status: 403,
          })
      )
    );
    const { auth } = fakeAuth(["t"]);
    try {
      await createDriveApi(auth).findFile();
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(DriveError);
      const err = e as DriveError;
      expect(err.status).toBe(403);
      expect(err.detail).not.toContain("ya29");
      expect(err.detail).not.toContain("secret-token");
    }
  });

  it("network failures become NETWORK errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      })
    );
    const { auth } = fakeAuth(["t"]);
    await expect(createDriveApi(auth).findFile()).rejects.toMatchObject({
      code: "NETWORK",
    });
  });

  it("createFile sends a multipart body with metadata then content", async () => {
    const fetchMock = vi.fn(async () => json({}));
    vi.stubGlobal("fetch", fetchMock);
    const { auth } = fakeAuth(["t"]);
    await createDriveApi(auth).createFile("{\"x\":1}");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("uploadType=multipart");
    expect(init.method).toBe("POST");
    const contentType = (init.headers as Record<string, string>)["Content-Type"];
    const boundary = /boundary=(.+)$/.exec(contentType)![1];
    const body = init.body as string;
    expect(body.startsWith(`--${boundary}\r\n`)).toBe(true);
    expect(body.endsWith(`\r\n--${boundary}--`)).toBe(true);
    const metadata = JSON.parse(
      body.split("\r\n\r\n")[1].split(`\r\n--${boundary}`)[0]
    );
    expect(metadata).toEqual({
      name: SYNC_FILE_NAME,
      parents: ["appDataFolder"],
      mimeType: "application/json",
    });
    expect(body).toContain("\r\n\r\n{\"x\":1}\r\n--" + boundary + "--");
  });

  it("updateFile PATCHes the media endpoint", async () => {
    const fetchMock = vi.fn(async () => json({}));
    vi.stubGlobal("fetch", fetchMock);
    const { auth } = fakeAuth(["t"]);
    await createDriveApi(auth).updateFile("abc", "text");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/abc?uploadType=media");
    expect(init.method).toBe("PATCH");
    expect(init.body).toBe("text");
  });
});