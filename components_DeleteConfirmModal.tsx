"use client";

type Props = {
  open: boolean;
  label: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function DeleteConfirmModal({ open, label, message, onCancel, onConfirm }: Props) {
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-red-400/20 bg-[#020608] p-5 text-white shadow-[0_0_40px_rgba(255,80,80,.16)]">
        <p className="text-xs font-black tracking-[0.2em] text-red-300">{label}</p>
        <h3 className="mt-2 text-xl font-black">{message}</h3>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" onClick={onCancel} className="rounded-xl border border-white/15 bg-black px-3 py-3 text-[10px] font-black tracking-[0.12em] text-white">CANCEL</button>
          <button type="button" onClick={onConfirm} className="rounded-xl bg-red-400 px-3 py-3 text-[10px] font-black tracking-[0.12em] text-white">DELETE</button>
        </div>
      </div>
    </div>
  );
}
