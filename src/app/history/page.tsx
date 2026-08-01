import type { Metadata } from "next";
import { HistoryList } from "@/components/history-list";

export const metadata: Metadata = {
  title: "History",
  description: "Every vent you've carved, with mood and tension over time.",
};

export default function HistoryPage() {
  return <HistoryList />;
}
