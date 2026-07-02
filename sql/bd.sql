-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.clientes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome_completo text NOT NULL,
  telefone text NOT NULL,
  endereco text,
  observacoes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT clientes_pkey PRIMARY KEY (id)
);
CREATE TABLE public.servicos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  valor numeric NOT NULL,
  duracao_minutos integer NOT NULL,
  ativo boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  é_pacote boolean DEFAULT false,
  CONSTRAINT servicos_pkey PRIMARY KEY (id)
);
CREATE TABLE public.agendamentos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cliente_id uuid,
  servico_id uuid,
  data_hora_inicio timestamp with time zone NOT NULL,
  data_hora_fim timestamp with time zone NOT NULL,
  endereco_atendimento text,
  status text DEFAULT 'pendente'::text CHECK (status = ANY (ARRAY['pendente'::text, 'confirmado'::text, 'concluido'::text, 'cancelado'::text])),
  observacoes text,
  lembrete_enviado boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  valor_cobrado numeric DEFAULT 0 CHECK (valor_cobrado IS NULL OR valor_cobrado >= 0::numeric),
  pacote_items jsonb DEFAULT '[]'::jsonb,
  CONSTRAINT agendamentos_pkey PRIMARY KEY (id),
  CONSTRAINT agendamentos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id),
  CONSTRAINT agendamentos_servico_id_fkey FOREIGN KEY (servico_id) REFERENCES public.servicos(id)
);
CREATE TABLE public.pacote_agendamentos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  agendamento_id uuid NOT NULL,
  item_1 boolean DEFAULT false,
  item_2 boolean DEFAULT false,
  item_3 boolean DEFAULT false,
  item_4 boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT pacote_agendamentos_pkey PRIMARY KEY (id),
  CONSTRAINT pacote_agendamentos_agendamento_id_fkey FOREIGN KEY (agendamento_id) REFERENCES public.agendamentos(id)
);