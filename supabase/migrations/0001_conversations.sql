-- conversations: id (uuid pk), pollinations_sub (text, not null), sandbox_id (text, nullable, no cascade), model (text), title (text), created_at, updated_at
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  pollinations_sub text not null,
  sandbox_id text,
  model text,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversations_sub_updated_idx
  on public.conversations (pollinations_sub, updated_at desc);

-- messages: id (uuid pk), conversation_id (fk, on delete cascade), role (text), model (text, nullable), content (jsonb), created_at
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null,
  model text,
  content jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at);

-- RLS
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- policies keyed to pollinations_sub via a request setting
create policy conversations_select on public.conversations
  for select using (pollinations_sub = current_setting('app.pollinations_sub', true));
create policy conversations_insert on public.conversations
  for insert with check (pollinations_sub = current_setting('app.pollinations_sub', true));
create policy conversations_update on public.conversations
  for update using (pollinations_sub = current_setting('app.pollinations_sub', true));
create policy conversations_delete on public.conversations
  for delete using (pollinations_sub = current_setting('app.pollinations_sub', true));

create policy messages_select on public.messages
  for select using (
    exists (select 1 from public.conversations c
            where c.id = messages.conversation_id
              and c.pollinations_sub = current_setting('app.pollinations_sub', true))
  );
create policy messages_insert on public.messages
  for insert with check (
    exists (select 1 from public.conversations c
            where c.id = messages.conversation_id
              and c.pollinations_sub = current_setting('app.pollinations_sub', true))
  );
create policy messages_update on public.messages
  for update using (
    exists (select 1 from public.conversations c
            where c.id = messages.conversation_id
              and c.pollinations_sub = current_setting('app.pollinations_sub', true))
  );
create policy messages_delete on public.messages
  for delete using (
    exists (select 1 from public.conversations c
            where c.id = messages.conversation_id
              and c.pollinations_sub = current_setting('app.pollinations_sub', true))
  );