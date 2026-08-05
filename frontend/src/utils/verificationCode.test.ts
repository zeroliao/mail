import { extractVerificationCode } from "./verificationCode";

describe("extractVerificationCode", () => {
  test("prioritizes a verification code in the subject", () => {
    expect(
      extractVerificationCode(["Your Code - 388702", "No code here"]),
    ).toBe("388702");
  });

  test("extracts a code from HTML mail content", () => {
    expect(
      extractVerificationCode([
        "Welcome",
        "<p>您的验证码为 <strong>A7C291</strong></p>",
      ]),
    ).toBe("A7C291");
    expect(
      extractVerificationCode([
        "Welcome",
        "<p>Your verification code is: 482910</p>",
      ]),
    ).toBe("482910");
  });

  test("does not treat unrelated numbers as verification codes", () => {
    expect(
      extractVerificationCode(["Invoice 388702", "Received on 2026-08-05"]),
    ).toBeNull();
  });
});
