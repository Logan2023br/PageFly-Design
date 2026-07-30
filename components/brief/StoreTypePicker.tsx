"use client";

import { STORE_TYPES } from "@/lib/briefOptions";
import { useStore } from "@/lib/store";
import { Chip, SectionCard } from "../ui";

export function StoreTypePicker() {
  const selected = useStore((s) => s.draft.storeType);
  const setStoreType = useStore((s) => s.setStoreType);

  return (
    <SectionCard
      id="pfd-store-type"
      eyebrow="Step 3"
      title="What kind of store?"
      help="Changes the navigation and the calls to action."
    >
      <div className="flex flex-wrap gap-2">
        {STORE_TYPES.map((t) => (
          <Chip
            key={t.id}
            selected={selected === t.id}
            onClick={() => setStoreType(t.id)}
          >
            {t.label}
          </Chip>
        ))}
      </div>
    </SectionCard>
  );
}
