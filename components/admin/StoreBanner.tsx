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

  /* Two genuinely different situations, and one blanket warning would either
     overstate the VPS case or understate the serverless one. */
  const serverless = file.startsWith("/tmp");

  return (
    <p className="flex items-start gap-2 rounded-pf-md border border-pf-warn/35 bg-pf-warn/10 px-3 py-2.5 text-[12px] leading-relaxed text-pf-warn">
      <span className="mt-px shrink-0">
        <Icon name="TriangleAlert" size={14} />
      </span>
      <span>
        {serverless ? (
          <>
            <strong className="font-semibold">Nothing here is saved.</strong> This
            is running on serverless with no database, so data lives in{" "}
            <code className="font-mono">{file}</code> for as long as the instance
            does, and each instance has its own. Fine for clicking through the
            product; set <code className="font-mono">DATABASE_URL</code> before
            anyone relies on it.
          </>
        ) : (
          <>
            Data is in a file (<code className="font-mono">{file}</code>), not
            Postgres. Correct on a single server with a persistent disk — never
            behind more than one process.
          </>
        )}
      </span>
    </p>
  );
}
