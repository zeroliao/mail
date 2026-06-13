import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import App from "./App";

vi.stubGlobal(
  "fetch",
  vi.fn(async () => ({
    ok: true,
    json: async () => ({
      status: "ok",
      database: { ok: true },
      oauthProviders: {
        gmailConfigured: false,
        microsoftConfigured: true
      }
    })
  }))
);

test("renders scaffold title", async () => {
  render(<App />);
  expect(screen.getByText("Mail Account Manager")).toBeInTheDocument();
  expect(await screen.findByText("connected")).toBeInTheDocument();
});
