-- Associate application data with the authenticated Supabase user.
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

ALTER TABLE public.servicos
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

ALTER TABLE public.pacote_agendamentos
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_clientes_user_id ON public.clientes(user_id);
CREATE INDEX IF NOT EXISTS idx_servicos_user_id ON public.servicos(user_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_user_id ON public.agendamentos(user_id);
CREATE INDEX IF NOT EXISTS idx_pacote_agendamentos_user_id ON public.pacote_agendamentos(user_id);

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pacote_agendamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clientes_own_data ON public.clientes;
CREATE POLICY clientes_own_data ON public.clientes
  FOR ALL
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS servicos_own_data ON public.servicos;
CREATE POLICY servicos_own_data ON public.servicos
  FOR ALL
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS agendamentos_own_data ON public.agendamentos;
CREATE POLICY agendamentos_own_data ON public.agendamentos
  FOR ALL
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS pacote_agendamentos_own_data ON public.pacote_agendamentos;
CREATE POLICY pacote_agendamentos_own_data ON public.pacote_agendamentos
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.agendamentos
      WHERE agendamentos.id = pacote_agendamentos.agendamento_id
        AND agendamentos.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.agendamentos
      WHERE agendamentos.id = pacote_agendamentos.agendamento_id
        AND agendamentos.user_id = (SELECT auth.uid())
    )
  );
