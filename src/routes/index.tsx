import { createFileRoute } from "@tanstack/react-router";
import { WardenGame } from "@/components/WardenGame";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "The Warden's Labyrinth — AI-Adaptive Cyber RPG" },
      {
        name: "description",
        content:
          "A 2D top-down cyber RPG where an AI Warden reshapes every level to counter how you play.",
      },
    ],
  }),
});

function Index() {
  return <WardenGame />;
}
