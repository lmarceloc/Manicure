-- Add pacote_items column to agendamentos table
-- This column stores an array of booleans representing each item in the package
-- Example: [true, true, true, true] means 4/4 items completed
-- Empty array [] means 0/4 or no package items

ALTER TABLE public.agendamentos
ADD COLUMN pacote_items jsonb DEFAULT '[]'::jsonb;

-- Create index for better query performance
CREATE INDEX idx_agendamentos_pacote_items ON public.agendamentos USING gin(pacote_items);
