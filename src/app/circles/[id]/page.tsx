import type { Metadata } from "next";
import { AgeGate } from "@/components/age-gate";
import { CircleRoom } from "@/components/circle-room";

export const metadata: Metadata = { title: "In circle" };

export default async function CirclePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AgeGate>
      <CircleRoom id={id} />
    </AgeGate>
  );
}
