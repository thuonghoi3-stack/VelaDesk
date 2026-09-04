import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchMarketBundle } from "./binance.server";

const Schema = z.object({
  symbol: z.string().min(3).max(20),
  ltf: z.enum(["15m", "1h", "4h", "1d"]),
  htf: z.enum(["15m", "1h", "4h", "1d"]),
  market: z.enum(["spot", "usdm"]),
  ltfBars: z.number().int().min(400).max(12_000),
  htfBars: z.number().int().min(200).max(4_000),
});

export const loadOhlcv = createServerFn({ method: "POST" })
  .validator((data: unknown) => Schema.parse(data))
  .handler(async ({ data }) => {
    return fetchMarketBundle(data);
  });
