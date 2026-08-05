/**
 * Browser-safe `stellar-confidential-sdk/chain` subpath: the on-chain reader, event fetch,
 * and auditor decrypt layer the Z6 web pages consume.
 *
 * This entry MUST NOT import any `node:*` module (directly or transitively) —
 * everything here is fetch-based (`@stellar/stellar-sdk` `rpc.Server`, the
 * indexer's global `fetch`) or pure crypto (auditor decrypt). It is exposed on
 * a DEDICATED subpath rather than the top-level `stellar-confidential-sdk` barrel because
 * the chain-layer `ConfidentialEvent` union (`chain/events.ts`) collides by
 * name with the state-engine's (`state/types.ts`); routing the chain reader
 * here keeps the top-level StateEngine surface unchanged.
 *
 * Exposes:
 *   - `ChainClient`, `ChainConfig`, `ContractIds`, `OnChainAccount`, `Signer`,
 *     `keypairSigner`, `InvokeResult`
 *   - chain-layer `ConfidentialEvent` union + `RegisterEvent`/`DepositEvent`/
 *     `MergeEvent`/`WithdrawEvent`/`TransferEvent`, `buildConfidentialEvent`,
 *     `fetchEvents`, `resolveEventRef`, `EventRef`, `eventRef`, `eventToJson`,
 *     `naturalEventId`, `cursorLedger`, `FetchEventsResult`
 *   - `hybridFetchEvents`, `hybridResolveEventRef`, `dedupeById`
 *   - `IndexerClient`, `IndexerConfig`, `parseIndexerEvent`
 *   - `auditTransfer`, `auditWithdraw`, `auditorPublicKey`, the channel helpers
 *   - the XDR `payload.ts` encoders
 */
export * from "./chain/index.js";
export * from "./auditor/index.js";
