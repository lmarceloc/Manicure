export default function Modal({ open, title, onClose, children, footer }) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
      <div
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
        onClick={onClose}
        role="button"
        tabIndex={0}
      />
      <div className="relative z-10 w-full max-w-xl rounded-3xl border border-white/15 bg-slate-900/70 p-6 shadow-2xl backdrop-blur-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="label">Detalhes</p>
            <h2 className="text-xl font-semibold">{title}</h2>
          </div>
          <button className="btn-ghost" onClick={onClose} type="button">
            Fechar
          </button>
        </div>
        <div className="mt-6 space-y-4">{children}</div>
        {footer ? <div className="mt-6 flex justify-end gap-3">{footer}</div> : null}
      </div>
    </div>
  )
}
