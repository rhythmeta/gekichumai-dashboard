import assert from "node:assert/strict";
import { test } from "node:test";
import { getRegistrationEmailError } from "../src/lib/app-helpers.ts";

test("registration accepts delegated TLDs, including internationalized domains", () => {
  for (const address of [
    " User+tag@mail.Example.CO.UK ",
    "user@example.photography",
    "user@例子.中国",
    "user@example.xn--fiqs8s",
  ]) {
    assert.equal(getRegistrationEmailError(address), null, address);
  }
});

test("registration rejects unknown TLDs and malformed email addresses", () => {
  for (const suffix of ["invalid", "cmo", "localhost"]) {
    assert.equal(
      getRegistrationEmailError(`user@example.com.${suffix}`),
      "flowUnknownEmailTld",
    );
  }
  for (const address of [
    "user@localhost",
    "a..b@example.com",
    "a@@example.com",
    "a@bad..com",
    "a@host.invalid/path.com",
  ]) {
    assert.equal(
      getRegistrationEmailError(address),
      "flowInvalidEmail",
      address,
    );
  }
});
