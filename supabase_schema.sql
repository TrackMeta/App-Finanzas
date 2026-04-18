-- =============================================
-- COACH FINANZAS – Supabase Schema
-- Pega esto en: Supabase → SQL Editor → New query → Run
-- =============================================

-- ── EXTENSIONES ────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── PROFILES ───────────────────────────────────────────────────────────────
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text,
  currency    text default 'PEN',
  photo       text,          -- base64 o URL
  financial_profile text,
  avatar_url  text,
  created_at  timestamptz default now()
);

alter table profiles enable row level security;
create policy "Usuarios ven su perfil"  on profiles for select using (auth.uid() = id);
create policy "Usuarios crean su perfil" on profiles for insert with check (auth.uid() = id);
create policy "Usuarios editan su perfil" on profiles for update using (auth.uid() = id);

-- ── CATEGORIES ─────────────────────────────────────────────────────────────
create table if not exists categories (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  icon        text default '🏷️',
  color       text default '#6B7280',
  type        text not null check (type in ('expense','income')),
  created_at  timestamptz default now()
);

alter table categories enable row level security;
create policy "Categorías propias" on categories for all using (auth.uid() = user_id);

-- ── ACCOUNTS ───────────────────────────────────────────────────────────────
create table if not exists accounts (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  icon            text default '💼',
  color           text default '#10B981',
  initial_balance numeric(12,2) default 0,
  created_at      timestamptz default now()
);

alter table accounts enable row level security;
create policy "Cuentas propias" on accounts for all using (auth.uid() = user_id);

-- ── TRANSACTIONS ───────────────────────────────────────────────────────────
create table if not exists transactions (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  type         text not null check (type in ('expense','income','transfer')),
  amount       numeric(12,2) not null,
  date         date not null,
  note         text,
  is_recurring boolean default false,
  category_id  uuid references categories(id) on delete set null,
  account_id   uuid references accounts(id) on delete set null,
  from_account uuid references accounts(id) on delete set null,
  to_account   uuid references accounts(id) on delete set null,
  created_at   timestamptz default now()
);

alter table transactions enable row level security;
create policy "Transacciones propias" on transactions for all using (auth.uid() = user_id);

-- Índices para mejorar velocidad de consultas por fecha
create index if not exists idx_transactions_user_date on transactions(user_id, date desc);
create index if not exists idx_transactions_user_created on transactions(user_id, created_at desc);

-- ── BUDGETS ────────────────────────────────────────────────────────────────
create table if not exists budgets (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  category_id   uuid not null references categories(id) on delete cascade,
  month         text not null,    -- formato YYYY-MM
  monthly_limit numeric(12,2) not null,
  created_at    timestamptz default now(),
  unique (user_id, category_id, month)
);

alter table budgets enable row level security;
create policy "Presupuestos propios" on budgets for all using (auth.uid() = user_id);

-- ── GOALS ──────────────────────────────────────────────────────────────────
create table if not exists goals (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  name           text not null,
  icon           text default '🎯',
  color          text default '#10B981',
  target_amount  numeric(12,2) not null,
  current_amount numeric(12,2) default 0,
  deadline       date,
  created_at     timestamptz default now()
);

alter table goals enable row level security;
create policy "Metas propias" on goals for all using (auth.uid() = user_id);

-- ── DEBTS ──────────────────────────────────────────────────────────────────
create table if not exists debts (
  id                 uuid primary key default uuid_generate_v4(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  name               text not null,
  total              numeric(12,2) not null,
  paid               numeric(12,2) default 0,
  interest_rate      numeric(5,2) default 0,
  installments       int default 1,
  paid_installments  int default 0,
  next_payment_date  date,
  created_at         timestamptz default now()
);

alter table debts enable row level security;
create policy "Deudas propias" on debts for all using (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════════════════
-- TRIGGER: crear datos por defecto al registrar un usuario nuevo
-- ══════════════════════════════════════════════════════════════════════════
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  -- Perfil
  insert into public.profiles (id, name, currency)
  values (new.id, split_part(new.email, '@', 1), 'PEN')
  on conflict (id) do nothing;

  -- Cuentas por defecto
  insert into public.accounts (user_id, name, icon, color, initial_balance) values
    (new.id, 'Efectivo',     '💵', '#10B981', 0),
    (new.id, 'Banco',        '🏦', '#3B82F6', 0),
    (new.id, 'Tarjeta',      '💳', '#8B5CF6', 0);

  -- Categorías de gasto por defecto
  insert into public.categories (user_id, name, icon, color, type) values
    (new.id, 'Alimentación',   '🍔', '#F59E0B', 'expense'),
    (new.id, 'Transporte',     '🚌', '#3B82F6', 'expense'),
    (new.id, 'Entretenimiento','🎮', '#8B5CF6', 'expense'),
    (new.id, 'Salud',          '💊', '#EF4444', 'expense'),
    (new.id, 'Hogar',          '🏠', '#06B6D4', 'expense'),
    (new.id, 'Educación',      '📚', '#10B981', 'expense'),
    (new.id, 'Ropa',           '👕', '#EC4899', 'expense'),
    (new.id, 'Otros gastos',   '💸', '#6B7280', 'expense'),
    -- Categorías de ingreso
    (new.id, 'Sueldo',         '💰', '#10B981', 'income'),
    (new.id, 'Freelance',      '💻', '#3B82F6', 'income'),
    (new.id, 'Inversiones',    '📈', '#8B5CF6', 'income'),
    (new.id, 'Otros ingresos', '🎁', '#F59E0B', 'income');

  return new;
end;
$$;

-- Conectar el trigger al registro de usuarios
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
