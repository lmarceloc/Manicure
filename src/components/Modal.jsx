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
      <div className="relative z-10 flex w-full max-w-xl flex-col rounded-3xl border border-white/15 bg-slate-900/70 p-6 shadow-2xl backdrop-blur-2xl max-h-[85vh]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="label">Detalhes</p>
            <h2 className="text-xl font-semibold">{title}</h2>
          </div>
          <button
            className="btn-ghost h-10 w-10 rounded-full text-xl leading-none"
            onClick={onClose}
            type="button"
            aria-label="Fechar"
            title="Fechar"
          >
            ×
          </button>
        </div>
        <div className="mt-6 flex-1 space-y-4 overflow-y-auto pr-1">{children}</div>
        {footer ? (
          <div className="mt-6 flex justify-end gap-3 border-t border-white/10 pt-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}
