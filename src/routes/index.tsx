import { createFileRoute } from "@tanstack/react-router";
import { Game } from "@/components/damas/Game";

export const Route = createFileRoute("/")({ component: Game });
