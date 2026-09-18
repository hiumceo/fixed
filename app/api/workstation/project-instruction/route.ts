import { NextRequest } from "next/server";
import { readResource, writeResource } from "@/lib/workstation-resource";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) { return readResource(request, "projectInstruction"); }
export async function PUT(request: Request) { return writeResource(request, "projectInstruction"); }
