import { ExternalLink } from "lucide-react";

/**
 * A script that lives in the repository, not in the package.
 *
 * `examples/` is deliberately outside the npm tarball, the published `files`
 * are `dist`, `circuits` and `NOTICE`, because an integrator wants a library and
 * not our fixtures. Which means a bare `node examples/condominium.mjs` set in
 * code type is a small lie by omission: someone who ran `npm i` and copied it
 * gets ENOENT, and the SDK gets blamed for it.
 *
 * So the provenance is on the label and the path is a link. A reader who wants
 * to check that the script is real opens it in a tab instead of cloning, and
 * nobody mistakes a repo fixture for the library's surface.
 */

const REPO = "https://github.com/aguilar1x/stellar-confidential-token-sdk";
const BRANCH = "master";

export function RepoScript({ path }: { path: string }) {
  return (
    <a
      href={`${REPO}/blob/${BRANCH}/${path}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-baseline gap-1 rounded border border-rule bg-paper-sunk px-1.5 py-0.5 font-mono text-[0.85em] transition-colors hover:border-accent/40 hover:text-accent"
    >
      {path}
      <ExternalLink className="size-2.5 self-center" />
    </a>
  );
}
