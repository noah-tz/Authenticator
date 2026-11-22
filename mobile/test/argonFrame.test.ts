import { describe, expect, it } from "vitest";
import fixture from "./fixtures/argon2-browser.json";
import { derive, handleMessage, hash, verify } from "../src/argonFrame";
import { argonDeriveKey } from "../src/core/argon";

// fixture: encoded hash and derived key produced by argon2-browser, the
// library the extension's sandbox page (src/argon.ts) uses.
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

describe("mobile argon frame", () => {
  it("verifies a hash made by argon2-browser", async () => {
    expect(await verify(fixture.encoded, fixture.password)).toBe(true);
    expect(await verify(fixture.encoded, "wrong")).toBe(false);
  });

  it("hashes to the same encoded string as argon2-browser", async () => {
    expect(await hash(fixture.password, fixture.salt)).toBe(fixture.encoded);
  });

  it("hashes and verifies its own output", async () => {
    const encoded = await hash("secret", "0123456789abcdef");
    expect(encoded.startsWith("$argon2id$v=19$m=19456,t=2,p=1$")).toBe(true);
    expect(await verify(encoded, "secret")).toBe(true);
  });

  it("returns false for a malformed hash", async () => {
    expect(await verify("not a hash", "x")).toBe(false);
  });

  it("derives the same key as argon2-browser and core/argon.ts", async () => {
    const d = fixture.derive;
    const salt = new Uint8Array(d.saltLen).fill(d.saltByte);
    const key = await derive({
      pass: d.pass,
      salt,
      time: d.time,
      mem: d.mem,
      parallelism: d.parallelism,
      hashLen: d.hashLen,
    });
    expect(hex(key)).toBe(d.hashHex);
    const core = await argonDeriveKey(d.pass, salt, {
      timeCost: d.time,
      memoryKiB: d.mem,
      parallelism: d.parallelism,
      hashLength: d.hashLen,
    } as Parameters<typeof argonDeriveKey>[2]);
    expect(hex(core)).toBe(hex(key));
  });

  it("answers the sandbox protocol", async () => {
    const replies: unknown[] = [];
    const reply = (data: unknown) => replies.push(data);
    await handleMessage(
      { action: "verify", hash: fixture.encoded, value: fixture.password },
      reply
    );
    await handleMessage(
      { action: "hash", value: fixture.password, salt: fixture.salt },
      reply
    );
    await handleMessage(
      {
        action: "derive",
        id: 7,
        pass: "x",
        salt: "short",
        time: 1,
        mem: 8,
        parallelism: 1,
        hashLen: 32,
      },
      reply
    );
    await handleMessage({ action: "unknown" }, reply);
    expect(replies[0]).toEqual({ response: true });
    expect(replies[1]).toEqual({ response: fixture.encoded });
    expect(replies[2]).toEqual({ id: 7, error: true });
    expect(replies).toHaveLength(3);
  });
});
