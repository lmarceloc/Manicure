alter table public.agendamentos
add column if not exists valor_cobrado numeric(10,2);

update public.agendamentos a
set valor_cobrado = s.valor
from public.servicos s
where a.servico_id = s.id
  and a.valor_cobrado is null;

alter table public.agendamentos
alter column valor_cobrado set default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'agendamentos_valor_cobrado_nao_negativo'
  ) then
    alter table public.agendamentos
    add constraint agendamentos_valor_cobrado_nao_negativo
    check (valor_cobrado is null or valor_cobrado >= 0);
  end if;
end $$;
