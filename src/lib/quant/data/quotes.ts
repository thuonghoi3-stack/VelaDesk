import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchQuotesBundle } from "./quotes.server";

const Schema = z.object({
  symbols: z.array(z.string().min(3).max(20)).min(1).max(30),
  /** Sparklines cost one extra kline call per symbol — poll them rarely. */
  withSpark: z.boolean().optional(),
});

export const loadQuotes = createServerFn({ method: "POST" })
  .validator((data: unknown) => Schema.parse(data))
  .handler(async ({ data }) => {
    return fetchQuotesBundle(data);
  });

export type { Quote } from "./quotes.server";
