import type { Metadata } from "next";
import { KeptList } from "@/components/kept-list";

export const metadata: Metadata = {
  title: "Memory",
  description: "What is kept between sessions, and how to take any of it back.",
};

/*
  `MemoriesList` read `/api/memories`, which requires a signed-in Supabase
  user. Nothing in this product signs anybody in — it runs on an anonymous id
  made on the device, deliberately, because the premise is saying a thing you
  cannot say out loud and an account is a name attached to it.

  So this page answered 401 to every person who has ever opened it, and then
  offered them a login for a feature nothing else touches. Meanwhile the
  memory that does exist — the carve, and what held — had no page at all.
*/
export default function MemoryPage() {
  return <KeptList />;
}
