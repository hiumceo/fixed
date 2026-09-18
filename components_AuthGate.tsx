"use client";
import { useEffect, useState } from "react";
import V1124Auth from "@/components_V1124Auth";
export default function AuthGate({ children, returnTo }: { children: React.ReactNode; returnTo: string }) {
  const [state,setState]=useState<"loading"|"signed-out"|"signed-in">("loading");
  useEffect(()=>{fetch("/api/auth",{cache:"no-store"}).then(r=>r.json()).then(d=>setState(d?.authenticated?"signed-in":"signed-out")).catch(()=>setState("signed-out"));},[]);
  if(state==="loading") return <main className="min-h-screen bg-[#030505]"/>;
  if(state==="signed-out") return <V1124Auth returnTo={returnTo}/>;
  return <>{children}</>;
}
