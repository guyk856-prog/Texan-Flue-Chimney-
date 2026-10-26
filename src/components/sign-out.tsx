"use client";
import { signOut } from "next-auth/react";
import { Button } from "./ui/button";
export function SignOut() {
  return (
    <Button
      variant="outline"
      onClick={() => signOut({ callbackUrl: "/login" })}
    >
      Sign out
    </Button>
  );
}
