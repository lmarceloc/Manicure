-- Recover legacy rows created before user_id was added.
-- The update runs only when the project has exactly one Auth user.
DO $$
DECLARE
  owner_id uuid;
  auth_user_count integer;
BEGIN
  SELECT COUNT(*)
    INTO auth_user_count
    FROM auth.users;

  IF auth_user_count = 1 THEN
    SELECT id
      INTO owner_id
      FROM auth.users
      LIMIT 1;
  END IF;

  IF auth_user_count = 1 THEN
    UPDATE public.clientes
      SET user_id = owner_id
      WHERE user_id IS NULL;

    UPDATE public.servicos
      SET user_id = owner_id
      WHERE user_id IS NULL;

    UPDATE public.agendamentos
      SET user_id = owner_id
      WHERE user_id IS NULL;

    UPDATE public.pacote_agendamentos AS pacotes
      SET user_id = agendamentos.user_id
      FROM public.agendamentos
      WHERE pacotes.agendamento_id = agendamentos.id
        AND pacotes.user_id IS NULL;
  ELSE
    RAISE NOTICE 'Backfill skipped: expected exactly one Auth user, found %.', auth_user_count;
  END IF;
END $$;
