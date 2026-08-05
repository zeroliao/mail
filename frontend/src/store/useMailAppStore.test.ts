import { beforeEach, describe, expect, test, vi } from "vitest";
import { getAuthToken } from "../services/http";
import { mailApi } from "../services/mailApi";
import { useMailAppStore } from "./useMailAppStore";

vi.mock("../services/http", () => ({
  getAuthToken: vi.fn(),
}));

vi.mock("../services/mailApi", () => ({
  mailApi: {
    clearToken: vi.fn(),
    getHealth: vi.fn(),
    getProviderConfig: vi.fn(),
    listAccounts: vi.fn(),
  },
}));

describe("mail app bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useMailAppStore.setState({
      bootstrapped: false,
      isBootstrapping: false,
      isAuthenticated: false,
      authError: "",
    });
    vi.mocked(getAuthToken).mockReturnValue("");
    vi.mocked(mailApi.getHealth).mockResolvedValue({ status: "ok" });
    vi.mocked(mailApi.getProviderConfig).mockResolvedValue({
      gmail: { enabled: true, callbackUrl: "/google" },
      microsoft: {
        enabled: true,
        callbackUrl: "/microsoft",
        tenantId: "common",
      },
    });
  });

  test("does not request protected account data without a token", async () => {
    const bootstrap = useMailAppStore.getState().bootstrap;

    await Promise.all([bootstrap(), bootstrap()]);

    expect(mailApi.getHealth).toHaveBeenCalledTimes(1);
    expect(mailApi.getProviderConfig).toHaveBeenCalledTimes(1);
    expect(mailApi.listAccounts).not.toHaveBeenCalled();
    expect(useMailAppStore.getState()).toMatchObject({
      bootstrapped: true,
      isBootstrapping: false,
      isAuthenticated: false,
      authError: "",
    });
  });
});
