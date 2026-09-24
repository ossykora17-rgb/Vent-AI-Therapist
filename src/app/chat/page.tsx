import type { Metadata } from "next";
import { AgeGate } from "@/components/age-gate";
import { VentChat } from "@/components/chat/vent-chat";

export const metadata: Metadata = { title: "Session" };

export default function ChatPage() {
  return (
    <AgeGate>
      <VentChat />
    </AgeGate>
  );
}
