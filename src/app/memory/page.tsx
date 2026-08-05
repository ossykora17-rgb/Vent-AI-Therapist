import type { Metadata } from "next";
import { MemoriesList } from "@/components/memories-list";

export const metadata: Metadata = {
  title: "Memory",
  description: "What is kept between sessions, and how to take any of it back.",
};

export default function MemoryPage() {
  return <MemoriesList />;
}
