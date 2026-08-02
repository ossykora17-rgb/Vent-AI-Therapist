import type { Metadata } from "next";
import { CirclesList } from "@/components/circles-list";

export const metadata: Metadata = {
  title: "Circles",
  description: "Six seats, forty-five minutes, no advice. Peer support, not therapy.",
};

export default function CirclesPage() {
  return <CirclesList />;
}
