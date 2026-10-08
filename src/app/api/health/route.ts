import { NextResponse } from "next/server";

import { listWikis } from "@/content/runtime";

export const dynamic = "force-dynamic";

/** Liveness probe: the configured wiki ids. Never builds a snapshot. */
export async function GET() {
  return NextResponse.json({ ok: true, wikis: listWikis().map((w) => w.id) });
}
