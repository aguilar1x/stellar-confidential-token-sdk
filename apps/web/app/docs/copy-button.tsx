"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Copy-to-clipboard for a code block. Appears on hover, stays for keyboards. */
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          // Clipboard access can be denied; the code is selectable either way.
        }
      }}
      aria-label={copied ? "Copied" : "Copy code"}
      className="absolute right-3 top-3 rounded-md border border-white/15 bg-white/10 p-1.5 text-white/70 opacity-0 transition-opacity hover:text-white focus-visible:opacity-100 group-hover:opacity-100"
    >
      {copied ? <Check className="size-3.5 text-verified" /> : <Copy className="size-3.5" />}
    </button>
  );
}
