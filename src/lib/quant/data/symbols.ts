import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchSymbolUniverse } from "./symbols.server";

const Schema = z.object({ quote: z.string().default("USDT").optional() });

export const searchSymbols = createServerFn({ method: "POST" })
  .validator((data: unknown) => Schema.parse(data ?? {}))
  .handler(async ({ data }) => {
    return fetchSymbolUniverse(data);
  });

export type { SymbolSearchResult } from "./symbols.server";
