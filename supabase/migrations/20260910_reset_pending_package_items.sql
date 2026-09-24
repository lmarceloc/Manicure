-- ATENÇÃO: migration já aplicada (UPDATE único, sem trigger/function). Rodada pelo SQL Editor, não consta em supabase_migrations.
-- NÃO rode este arquivo de novo: ele zeraria o pacote_items que o n8n grava nos agendamentos pendentes.

-- Remove progress copied to pending package appointments by the old frontend logic.
-- Completed appointments keep their historical pacote_items.
UPDATE public.agendamentos AS agendamentos
SET pacote_items = COALESCE(
  (
    SELECT jsonb_agg('false'::jsonb ORDER BY items.ordinality)
    FROM jsonb_array_elements(agendamentos.pacote_items) WITH ORDINALITY AS items(value, ordinality)
  ),
  '[]'::jsonb
)
FROM public.servicos AS servicos
WHERE agendamentos.servico_id = servicos.id
  AND servicos.é_pacote = true
  AND agendamentos.status <> 'concluido'
  AND jsonb_typeof(agendamentos.pacote_items) = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(agendamentos.pacote_items) AS items(value)
    WHERE items.value = 'true'::jsonb
  );
