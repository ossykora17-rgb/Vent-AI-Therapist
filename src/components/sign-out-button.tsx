"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { signOut } from "@/app/auth/actions";

export function SignOutButton() {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  async function confirm() {
    setPending(true);
    try {
      await signOut();
    } finally {
      // The redirect unmounts this, but reset in case the action rejects.
      setPending(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Log out
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        dismissible={!pending}
        title="Log out?"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Stay
            </Button>
            <Button variant="primary" loading={pending} onClick={confirm}>
              Log out
            </Button>
          </>
        }
      >
        Your sessions stay saved. You can come straight back in.
      </Modal>
    </>
  );
}
