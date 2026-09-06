import { createFileRoute } from "@tanstack/react-router";
import { ScreenerPage } from "@/components/terminal/screener-page";

export const Route = createFileRoute("/screener")({
  component: ScreenerPage,
});
