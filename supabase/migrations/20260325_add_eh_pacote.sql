-- Add é_pacote column to servicos table to identify package services
ALTER TABLE public.servicos
ADD COLUMN é_pacote boolean DEFAULT false;

-- Mark the 3 package services
UPDATE public.servicos
SET é_pacote = true
WHERE nome IN ('2maos e 2 pes', '4 mãos e 2 pés', 'Pacotes 4 mãos');
