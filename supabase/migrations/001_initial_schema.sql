-- =============================================
-- App Finanzas – Schema inicial con RLS
-- =============================================

-- Habilitar extensiones
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- PROFILES
-- =============================================
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  currency TEXT NOT NULL DEFAULT 'PEN',
  financial_profile TEXT CHECK (financial_profile IN ('saver', 'spender', 'balanced')),
  truth_mode BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- =============================================
-- CATEGORIES
-- =============================================
CREATE TABLE categories (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '💸',
  color TEXT NOT NULL DEFAULT '#6B7280',
  type TEXT NOT NULL CHECK (type IN ('expense', 'income', 'both')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own categories" ON categories USING (auth.uid() = user_id);

-- =============================================
-- TRANSACTIONS
-- =============================================
CREATE TABLE transactions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('expense', 'income', 'transfer')),
  amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  subcategory TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
  recurring_id UUID
);

CREATE INDEX idx_transactions_user_date ON transactions(user_id, date DESC);
CREATE INDEX idx_transactions_category ON transactions(category_id);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own transactions" ON transactions USING (auth.uid() = user_id);

-- =============================================
-- GOALS
-- =============================================
CREATE TABLE goals (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '🎯',
  color TEXT NOT NULL DEFAULT '#10B981',
  target_amount DECIMAL(12, 2) NOT NULL CHECK (target_amount > 0),
  current_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  deadline DATE NOT NULL,
  auto_contribution DECIMAL(12, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own goals" ON goals USING (auth.uid() = user_id);

-- =============================================
-- DEBTS
-- =============================================
CREATE TABLE debts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  total DECIMAL(12, 2) NOT NULL CHECK (total > 0),
  paid DECIMAL(12, 2) NOT NULL DEFAULT 0,
  interest_rate DECIMAL(5, 2) NOT NULL DEFAULT 0,
  installments INTEGER NOT NULL DEFAULT 1,
  paid_installments INTEGER NOT NULL DEFAULT 0,
  next_payment_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE debts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own debts" ON debts USING (auth.uid() = user_id);

-- =============================================
-- BUDGETS
-- =============================================
CREATE TABLE budgets (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE NOT NULL,
  monthly_limit DECIMAL(12, 2) NOT NULL CHECK (monthly_limit > 0),
  period TEXT NOT NULL DEFAULT to_char(NOW(), 'YYYY-MM'),
  UNIQUE(user_id, category_id, period)
);

ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own budgets" ON budgets USING (auth.uid() = user_id);

-- =============================================
-- ACHIEVEMENTS
-- =============================================
CREATE TABLE achievements (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, type)
);

ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own achievements" ON achievements FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own achievements" ON achievements FOR INSERT WITH CHECK (auth.uid() = user_id);

-- =============================================
-- STREAKS
-- =============================================
CREATE TABLE streaks (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE PRIMARY KEY,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_log_date DATE
);

ALTER TABLE streaks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own streak" ON streaks USING (auth.uid() = user_id);

-- =============================================
-- TRIGGER: crear perfil + streak + categorías al registrarse
-- =============================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Crear perfil (ON CONFLICT para no fallar si ya existe)
  INSERT INTO public.profiles (id, email, name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(COALESCE(NEW.email,''), '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Crear streak
  INSERT INTO public.streaks (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Crear categorías solo si el usuario no tiene ninguna
  IF NOT EXISTS (SELECT 1 FROM public.categories WHERE user_id = NEW.id) THEN
    INSERT INTO public.categories (user_id, name, icon, color, type) VALUES
      (NEW.id, 'Comida',         '🍔', '#F59E0B', 'expense'),
      (NEW.id, 'Transporte',     '🚌', '#3B82F6', 'expense'),
      (NEW.id, 'Vivienda',       '🏠', '#8B5CF6', 'expense'),
      (NEW.id, 'Salud',          '💊', '#EF4444', 'expense'),
      (NEW.id, 'Ocio',           '🎮', '#EC4899', 'expense'),
      (NEW.id, 'Suscripciones',  '📱', '#06B6D4', 'expense'),
      (NEW.id, 'Educación',      '📚', '#10B981', 'expense'),
      (NEW.id, 'Ropa',           '👕', '#F97316', 'expense'),
      (NEW.id, 'Delivery',       '🛵', '#84CC16', 'expense'),
      (NEW.id, 'Otros gastos',   '💸', '#6B7280', 'expense'),
      (NEW.id, 'Sueldo',         '💼', '#10B981', 'income'),
      (NEW.id, 'Freelance',      '💻', '#8B5CF6', 'income'),
      (NEW.id, 'Inversiones',    '📈', '#3B82F6', 'income'),
      (NEW.id, 'Regalo',         '🎁', '#EC4899', 'income'),
      (NEW.id, 'Otros ingresos', '💰', '#6B7280', 'income');
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'handle_new_user error para %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();

-- =============================================
-- FUNCIÓN: actualizar streak al agregar transacción
-- =============================================
CREATE OR REPLACE FUNCTION update_streak_on_transaction()
RETURNS TRIGGER AS $$
DECLARE
  v_last_date DATE;
  v_current DATE := CURRENT_DATE;
  v_streak INTEGER;
  v_longest INTEGER;
BEGIN
  SELECT last_log_date, current_streak, longest_streak
  INTO v_last_date, v_streak, v_longest
  FROM streaks WHERE user_id = NEW.user_id;

  IF v_last_date IS NULL OR v_last_date < v_current - INTERVAL '1 day' THEN
    -- Reiniciar streak si pasó más de 1 día
    IF v_last_date = v_current - INTERVAL '1 day' THEN
      v_streak := v_streak + 1;
    ELSE
      v_streak := 1;
    END IF;
  END IF;

  IF v_streak > v_longest THEN
    v_longest := v_streak;
  END IF;

  UPDATE streaks
  SET current_streak = v_streak,
      longest_streak = v_longest,
      last_log_date = v_current
  WHERE user_id = NEW.user_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_transaction_created
  AFTER INSERT ON transactions
  FOR EACH ROW EXECUTE PROCEDURE update_streak_on_transaction();
