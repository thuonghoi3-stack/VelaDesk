import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchScan } from "./scan.server";

const Schema = z.object({
  symbols: z.array(z.string().min(3).max(20)).min(1).max(30),
  ltf: z.enum(["5m", "15m", "30m", "1h", "2h", "4h", "1d", "1w"]),
  htf: z.enum(["5m", "15m", "30m", "1h", "2h", "4h", "1d", "1w"]),
  market: z.enum(["spot", "usdm"]),
});

export const scanMarket = createServerFn({ method: "POST" })
  .validator((data: unknown) => Schema.parse(data))
  .handler(async ({ data }) => {
    return fetchScan(data);
  });

export type { ScanRow, ScanResult } from "./scan.server";
