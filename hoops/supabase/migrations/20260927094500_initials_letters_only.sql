-- Initials are three letters, like an arcade high-score table.
alter table public.scores drop constraint scores_initials_check;
alter table public.scores add constraint scores_initials_check check (initials ~ '^[A-Z]{3}$');
