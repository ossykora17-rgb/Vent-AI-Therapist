import type { Metadata } from "next";
import { VentChat } from "@/components/chat/vent-chat";

export const metadata: Metadata = { title: "Session" };

export default function ChatPage() {
  return <VentChat />;
}
