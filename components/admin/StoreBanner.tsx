import { Icon } from "../ui";

/* Says where the data actually is. An operator should never have to read code or
   guess whether what they are looking at survives a restart — and the file store
   is correct on one server and catastrophic on serverless, so which one it is
   matters more than most configuration. */
export function StoreBanner({
  kind,
  file,
}: {
  kind: "postgres" | "file";
  file: string;
}) {
  if (kind === "postgres") return null;

  return (
    <p className="flex items-start gap-2 rounded-pf-md border border-pf-warn/35 bg-pf-warn/10 px-3 py-2.5 text-[12px] leading-relaxed text-pf-warn">
      <span className="mt-px shrink-0">
        <Icon name="TriangleAlert" size={14} />
      </span>
      <span>
        Data is in a file (<code className="font-mono">{file}</code>), not
        Postgres. Fine on a single server with a persistent disk. On serverless
        each instance keeps its own copy, so merchants would see their library
        come and go — set <code className="font-mono">DATABASE_URL</code> there.
      </span>
    </p>
  );
}
