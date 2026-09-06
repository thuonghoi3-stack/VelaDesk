import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchMarketBundle } from "./binance.server";

const Schema = z.object({
  symbol: z.string().min(3).max(20),
  ltf: z.enum(["5m", "15m", "30m", "1h", "2h", "4h", "1d", "1w"]),
  htf: z.enum(["5m", "15m", "30m", "1h", "2h", "4h", "1d", "1w"]),
  market: z.enum(["spot", "usdm"]),
  ltfBars: z.number().int().min(400).max(120_000),
  htfBars: z.number().int().min(200).max(20_000),
});

export const loadOhlcv = createServerFn({ method: "POST" })
  .validator((data: unknown) => Schema.parse(data))
  .handler(async ({ data }) => {
    return fetchMarketBundle(data);
  });
