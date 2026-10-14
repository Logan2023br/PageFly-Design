"use client";

import { useState } from "react";
import type { AccountsResponse, AdminAccountView } from "@/app/api/admin/accounts/route";
import { ADMIN_SECTIONS, type AdminSection } from "@/lib/adminSections";
import { Button, Icon, Panel } from "../ui";
import { FIELD, FIELD_LABEL } from "./collections/shared";

/* ==========================================================================
   /design/admin/accounts — make a sign-in, tick what it may open.

   One row per account; Edit opens the same ticks in place, with a field for a
   new password left empty to keep the old one. The owner (ADMIN_USERNAME) is
   shown first and cannot be edited: it is configured, not stored.
   ========================================================================== */

async function call(url: string, init?: RequestInit): Promise<AccountsResponse> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    });
    return ((await res.json().catch(() => null)) as AccountsResponse | null) ?? {
      ok: false,
      error: `The server answered ${res.status}.`,
    };
  } catch {
    return { ok: false, error: "No connection — try again." };
  }
}

function SectionPicker({
  value,
  onChange,
}: {
  value: AdminSection[];
  onChange: (v: AdminSection[]) => void;
}) {
  const all = value.length === ADMIN_SECTIONS.length;
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <span className={FIELD_LABEL}>Quyền truy cập</span>
        <button
          type="button"
          onClick={() => onChange(all ? [] : ADMIN_SECTIONS.map((s) => s.id))}
          className="text-[12px] font-semibold text-pf-primary-hi hover:underline"
        >
          {all ? "Bỏ chọn hết" : "Chọn tất cả"}
        </button>
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
        {ADMIN_SECTIONS.map((s) => {
          const on = value.includes(s.id);
          return (
            <label
              key={s.id}
              className={`flex cursor-pointer items-center gap-2 rounded-pf-md border px-3 py-2 text-[13px] font-semibold transition-colors ${
                on
                  ? "border-pf-primary-hi bg-pf-primary/10 text-pf-text"
                  : "border-pf-border text-pf-body hover:border-pf-border-hi"
              }`}
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() =>
                  onChange(on ? value.filter((v) => v !== s.id) : [...value, s.id])
                }
                className="size-4 accent-pf-primary"
              />
              {s.label}
            </label>
          );
        })}
      </div>
    </div>
  );
}

function SectionChips({ sections }: { sections: AdminSection[] }) {
  if (sections.length === 0)
    return <span className="text-[12px] text-pf-faint">Chưa có quyền nào</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {ADMIN_SECTIONS.filter((s) => sections.includes(s.id)).map((s) => (
        <span
          key={s.id}
          className="rounded-pf-pill border border-pf-border bg-pf-card-hi px-2 py-0.5 text-[11px] font-semibold text-pf-body"
        >
          {s.label}
        </span>
      ))}
    </div>
  );
}

export function AccountsAdmin({
  owner,
  initial,
}: {
  owner: string;
  initial: AdminAccountView[];
}) {
  const [accounts, setAccounts] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  /* the new-account form */
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [sections, setSections] = useState<AdminSection[]>([]);

  /* the row being edited */
  const [editSections, setEditSections] = useState<AdminSection[]>([]);
  const [editPassword, setEditPassword] = useState("");

  const run = async (url: string, init: RequestInit) => {
    setBusy(true);
    setError(null);
    const res = await call(url, init);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return false;
    }
    setAccounts(res.accounts);
    return true;
  };

  const create = async () => {
    const ok = await run("/api/admin/accounts", {
      method: "POST",
      body: JSON.stringify({ username, password, sections }),
    });
    if (ok) {
      setUsername("");
      setPassword("");
      setSections([]);
    }
  };

  const save = async (id: string) => {
    const ok = await run("/api/admin/accounts", {
      method: "PATCH",
      body: JSON.stringify({ id, sections: editSections, password: editPassword }),
    });
    if (ok) setEditing(null);
  };

  const remove = (a: AdminAccountView) => {
    if (!window.confirm(`Xoá tài khoản “${a.username}”? Tài khoản này sẽ bị đăng xuất ngay.`))
      return;
    void run(`/api/admin/accounts?id=${encodeURIComponent(a.id)}`, { method: "DELETE" });
  };

  return (
    <div className="grid gap-4">
      <Panel className="grid gap-4 p-4">
        <p className="font-display text-[15px] font-semibold text-pf-text">Tạo tài khoản</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5">
            <span className={FIELD_LABEL}>Tên đăng nhập</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="vd. alfie"
              autoComplete="off"
              className={FIELD}
            />
          </label>
          <label className="grid gap-1.5">
            <span className={FIELD_LABEL}>Mật khẩu</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Ít nhất 8 ký tự"
              autoComplete="new-password"
              className={FIELD}
            />
          </label>
        </div>
        <SectionPicker value={sections} onChange={setSections} />
        <div className="flex justify-end">
          <Button
            icon="UserPlus"
            onClick={() => void create()}
            disabled={busy || !username.trim() || !password}
          >
            {busy ? "Đang lưu…" : "Tạo tài khoản"}
          </Button>
        </div>
      </Panel>

      {error && (
        <p role="alert" className="text-[13px] text-pf-danger">
          {error}
        </p>
      )}

      <ul className="grid gap-2.5">
        <li>
          <Panel className="flex flex-wrap items-center gap-3 p-4">
            <Icon name="ShieldCheck" size={18} className="text-pf-success" />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-pf-text">{owner}</p>
              <p className="text-[12px] text-pf-faint">
                Tài khoản gốc (ADMIN_USERNAME) — luôn có toàn quyền, không sửa ở đây
              </p>
            </div>
            <span className="rounded-pf-pill border border-pf-success/30 bg-pf-success/10 px-2 py-0.5 text-[11px] font-semibold text-pf-success">
              Toàn quyền
            </span>
          </Panel>
        </li>
        {accounts.map((a) => (
          <li key={a.id}>
            <Panel className="grid gap-3 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <Icon name="Users" size={18} className="text-pf-faint" />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-pf-text">{a.username}</p>
                  <p className="text-[12px] text-pf-faint">
                    Tạo {new Date(a.createdAt).toLocaleDateString("vi-VN")}
                  </p>
                </div>
                {editing !== a.id && <SectionChips sections={a.sections} />}
                <div className="flex items-center gap-1.5">
                  {editing === a.id ? (
                    <>
                      <Button variant="quiet" size="sm" onClick={() => setEditing(null)}>
                        Huỷ
                      </Button>
                      <Button size="sm" onClick={() => void save(a.id)} disabled={busy}>
                        {busy ? "Đang lưu…" : "Lưu"}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon="Pencil"
                        onClick={() => {
                          setEditing(a.id);
                          setEditSections(a.sections);
                          setEditPassword("");
                        }}
                        disabled={busy}
                      >
                        Sửa
                      </Button>
                      <button
                        type="button"
                        onClick={() => remove(a)}
                        disabled={busy}
                        aria-label={`Xoá ${a.username}`}
                        className="grid size-8 place-items-center rounded-pf-md text-pf-faint transition-colors hover:bg-pf-danger/10 hover:text-pf-danger"
                      >
                        <Icon name="Trash2" size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
              {editing === a.id && (
                <div className="grid gap-3 border-t border-pf-border pt-3">
                  <SectionPicker value={editSections} onChange={setEditSections} />
                  <label className="grid max-w-sm gap-1.5">
                    <span className={FIELD_LABEL}>Mật khẩu mới</span>
                    <input
                      type="password"
                      value={editPassword}
                      onChange={(e) => setEditPassword(e.target.value)}
                      placeholder="Để trống nếu giữ mật khẩu cũ"
                      autoComplete="new-password"
                      className={FIELD}
                    />
                  </label>
                </div>
              )}
            </Panel>
          </li>
        ))}
      </ul>
    </div>
  );
}
