"use client";

import { useEffect, useState } from "react";

import { loadReceipts, mergeReceipts, type StoredReceipt } from "@/lib/receipt";
import { Receipt } from "./receipt";

/**
 * Decides whether this visitor has a receipt to show, and where it came from.
 *
 * Two sources, in this order:
 *
 *   1. The query string, when they arrived by following the link from a payment
 *      they just made, or reopened one they had pasted somewhere. An explicit
 *      URL is always the stronger signal and stays shareable.
 *   2. sessionStorage, when they paid earlier in this visit and have since been
 *      to other pages. This is the case the query string alone could not cover.
 *
 * Storage is read after mount rather than during render: it does not exist on
 * the server, so seeding state from it would hydrate against different HTML.
 * The panel is absent on the first paint and appears once, which is honest,
 * since until then the page genuinely does not know whether anyone paid.
 */
export function ReceiptSlot({
  urlTx,
  urlAmount,
  total,
  blinding,
  onchainCommitment,
  contract,
  account,
  rpcUrl,
}: {
  urlTx: string | null;
  urlAmount: string;
  total: string;
  blinding: string;
  onchainCommitment: string;
  contract: string;
  account: string;
  rpcUrl: string;
}) {
  const [stored, setStored] = useState<StoredReceipt[]>([]);

  useEffect(() => {
    setStored(loadReceipts());
  }, []);

  /**
   * The URL's receipt goes first when there is one. It is the payment they
   * just made, and it must show even on a machine whose storage is empty
   * (a pasted link, a fresh tab). Everything else follows, deduped.
   */
  const receipts = mergeReceipts(
    urlTx ? [{ tx: urlTx, amountStroops: urlAmount }] : [],
    stored,
  );

  if (receipts.length === 0) return null;

  return (
    <div className="mt-12 border-t border-rule pt-12">
      <Receipt
        receipts={receipts}
        total={total}
        blinding={blinding}
        onchainCommitment={onchainCommitment}
        contract={contract}
        account={account}
        rpcUrl={rpcUrl}
      />
    </div>
  );
}
