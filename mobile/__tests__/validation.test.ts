import {
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD_LENGTH,
  validateEmail,
  validateLoginPassword,
  validatePassword,
} from "@/utils/validation";

describe("validateEmail", () => {
  it("accepts a well-formed address", () => {
    expect(validateEmail("synthetic.user@example.com")).toBeNull();
  });

  it("ignores surrounding whitespace from autofill and mobile keyboards", () => {
    expect(validateEmail("  synthetic.user@example.com  ")).toBeNull();
  });

  it("asks for an address when the field is empty", () => {
    expect(validateEmail("")).toMatch(/enter your email/i);
    expect(validateEmail("   ")).toMatch(/enter your email/i);
  });

  it("rejects an address with no @ or no domain", () => {
    expect(validateEmail("not-an-email")).toMatch(/doesn't look like/i);
    expect(validateEmail("missing@domain")).toMatch(/doesn't look like/i);
  });
});

describe("validatePassword", () => {
  it("accepts a password of an ordinary length", () => {
    expect(validatePassword("fake-password-1")).toBeNull();
  });

  it("requires a minimum length", () => {
    expect(validatePassword("a".repeat(MIN_PASSWORD_LENGTH - 1))).toMatch(/at least 8/i);
  });

  it("accepts a password exactly at the bcrypt byte limit", () => {
    expect(validatePassword("a".repeat(MAX_PASSWORD_BYTES))).toBeNull();
  });

  it("rejects a password past the bcrypt byte limit", () => {
    // Beyond 72 bytes bcrypt ignores the remainder, so a longer password would
    // be authenticated by any string sharing its first 72 bytes.
    expect(validatePassword("a".repeat(MAX_PASSWORD_BYTES + 1))).toMatch(/too long/i);
  });

  it("measures the limit in UTF-8 bytes, matching the server", () => {
    // "é" is two bytes, so 40 of them exceed 72 bytes despite being 40 chars.
    expect(validatePassword("é".repeat(40))).toMatch(/too long/i);
  });
});

describe("validateLoginPassword", () => {
  it("only requires that something was entered", () => {
    expect(validateLoginPassword("x")).toBeNull();
    expect(validateLoginPassword("")).toMatch(/enter your password/i);
  });
});
