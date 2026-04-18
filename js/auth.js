// =============================================
// AUTH – Supabase Authentication
// =============================================

// Cliente Supabase (usa variables de config.js)
const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Cache síncrono del usuario actual (se hidrata en init)
let _cachedUser = null;

const AuthService = {
  // ── Acceso síncrono al user en caché ──────
  getCachedUser()    { return _cachedUser; },
  getCurrentUserId() { return _cachedUser?.id || null; },
  isLoggedIn()       { return !!_cachedUser; },

  // ── Sesión ────────────────────────────────
  async loadSession() {
    const { data: { session } } = await _sb.auth.getSession();
    _cachedUser = session?.user ?? null;
    return _cachedUser;
  },

  getSession() { return _cachedUser; },

  // ── Registro ──────────────────────────────
  async register(email, password) {
    if (!email.includes('@'))  throw new Error('Correo inválido');
    if (password.length < 6)   throw new Error('La contraseña debe tener al menos 6 caracteres');

    const { data, error } = await _sb.auth.signUp({ email, password });

    if (error) {
      if (error.message.includes('already registered')) throw new Error('Ya existe una cuenta con ese correo');
      throw new Error(error.message);
    }
    if (!data.user) throw new Error('Error al crear la cuenta. Intenta de nuevo.');

    _cachedUser = data.user;
    return data.user;
  },

  // ── Login ─────────────────────────────────
  async login(email, password) {
    const { data, error } = await _sb.auth.signInWithPassword({ email, password });
    if (error) {
      if (error.message.includes('Invalid login')) throw new Error('Correo o contraseña incorrectos');
      throw new Error(error.message);
    }
    _cachedUser = data.user;
    return data.user;
  },

  // ── Logout ────────────────────────────────
  async logout() {
    await _sb.auth.signOut();
    _cachedUser = null;
  },

  // ── Escuchar cambios de sesión ────────────
  onAuthStateChange(cb) {
    _sb.auth.onAuthStateChange((_event, session) => {
      _cachedUser = session?.user ?? null;
      cb(session?.user ?? null);
    });
  },

  // ── Cambiar contraseña ────────────────────
  async changePassword(newPassword) {
    const { error } = await _sb.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);
  },
};
