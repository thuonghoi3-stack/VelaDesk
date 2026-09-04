import { createFileRoute } from "@tanstack/react-router";
import { DeskApp } from "@/components/desk/desk-app";
import { useDesk } from "@/lib/quant/store";

export const Route = createFileRoute("/")({
  loader: () => {
    const desk = useDesk.getState();
    if (desk.ltf.length === 0) desk.loadSynthetic();
    return { bars: useDesk.getState().ltf.length };
  },
  component: Home,
});

function Home() {
  return <DeskApp />;
}
