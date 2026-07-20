import { describe, it, expect, vi, beforeEach } from "vitest";

const rpcMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...a: any[]) => rpcMock(...a) },
}));

import { checkGeoGrants } from "@/lib/geoGrantsCheck";

beforeEach(() => { rpcMock.mockReset(); });

describe("checkGeoGrants", () => {
  it("returns ok when RPC reports ok", async () => {
    rpcMock.mockResolvedValueOnce({ data: { ok: true, missing: [] }, error: null });
    const rep = await checkGeoGrants(true);
    expect(rep.ok).toBe(true);
    expect(rep.missing).toEqual([]);
    expect(rpcMock).toHaveBeenCalledWith("check_geo_grants");
  });

  it("captures missing grants list from RPC", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: false, missing: ["regions.INSERT", "states.INSERT"] },
      error: null,
    });
    const rep = await checkGeoGrants(true);
    expect(rep.ok).toBe(false);
    expect(rep.missing).toContain("regions.INSERT");
  });

  it("returns not-ok on RPC error", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "denied" } });
    const rep = await checkGeoGrants(true);
    expect(rep.ok).toBe(false);
    expect(rep.error).toBe("denied");
  });
});
