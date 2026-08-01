import type { Metadata } from "next";
import { CircleRoom } from "@/components/circle-room";

export const metadata: Metadata = { title: "In circle" };

export default function CirclePage({ params }: { params: { id: string } }) {
  return <CircleRoom id={params.id} />;
}
