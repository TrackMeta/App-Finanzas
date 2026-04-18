// =============================================
// AUTH – registro, login y sesión local
// =============================================

async function _hashPwd(password) {
  const data = new TextEncoder().encode(password + 'cf_salt_v1');
  const buf  = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

const AuthService = {
  // ---------- Almacenamiento ----------
  _getUsers()         { try { return JSON.parse(localStorage.getItem('cf_users') || '[]'); } catch { return []; } },
  _saveUsers(users)   { localStorage.setItem('cf_users', JSON.stringify(users)); },
  _setSession(s)      { localStorage.setItem('cf_session', JSON.stringify(s)); },
  _clearSession()     { localStorage.removeItem('cf_session'); },

  // ---------- Sesión ----------
  getSession() {
    try { const s = localStorage.getItem('cf_session'); return s ? JSON.parse(s) : null; }
    catch { return null; }
  },
  isLoggedIn() { return !!this.getSession(); },

  // ---------- Registro ----------
  async register(name, email, password) {
    if (!name.trim())          throw new Error('Ingresa tu nombre');
    if (!email.includes('@'))  throw new Error('Correo inválido');
    if (password.length < 6)   throw new Error('La contraseña debe tener al menos 6 caracteres');

    const users    = this._getUsers();
    const emailKey = email.toLowerCase().trim();
    if (users.find(u => u.email === emailKey)) throw new Error('Ya existe una cuenta con este correo');

    const hash = await _hashPwd(password);
    const user = {
      id:           (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)),
      name:         name.trim(),
      email:        emailKey,
      passwordHash: hash,
      createdAt:    new Date().toISOString(),
    };
    users.push(user);
    this._saveUsers(users);

    const session = { id: user.id, name: user.name, email: user.email };
    this._setSession(session);
    return session;
  },

  // ---------- Login ----------
  async login(email, password) {
    const users    = this._getUsers();
    const emailKey = email.toLowerCase().trim();
    const user     = users.find(u => u.email === emailKey);
    if (!user) throw new Error('No encontramos una cuenta con ese correo');
    const hash = await _hashPwd(password);
    if (hash !== user.passwordHash) throw new Error('Contraseña incorrecta');

    const session = { id: user.id, name: user.name, email: user.email };
    this._setSession(session);
    return session;
  },

  // ---------- Logout ----------
  logout() { this._clearSession(); },

  // ---------- Cambiar contraseña ----------
  async changePassword(currentPwd, newPwd) {
    const session = this.getSession();
    if (!session) throw new Error('No hay sesión activa');
    if (newPwd.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres');

    const users = this._getUsers();
    const idx   = users.findIndex(u => u.id === session.id);
    if (idx < 0) throw new Error('Usuario no encontrado');

    const currentHash = await _hashPwd(currentPwd);
    if (currentHash !== users[idx].passwordHash) throw new Error('Contraseña actual incorrecta');

    users[idx].passwordHash = await _hashPwd(newPwd);
    this._saveUsers(users);
  },

  // ---------- Actualizar nombre ----------
  updateName(newName) {
    const session = this.getSession();
    if (!session) return;
    const users = this._getUsers();
    const idx   = users.findIndex(u => u.id === session.id);
    if (idx >= 0) { users[idx].name = newName; this._saveUsers(users); }
    session.name = newName;
    this._setSession(session);
  },

  // ---------- Lista de usuarios (para admin/debug) ----------
  listUsers() { return this._getUsers().map(({ passwordHash, ...u }) => u); },
};
