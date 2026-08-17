/**
 * Backend layer (localStorage-backed demo API)
 * - Admin authentication route (section 1)
 * - Orders / clients persistence
 * - Occupied date ranges from active orders
 *
 * PRODUCTION: replace hardcoded admin password with bcrypt/argon2 hash
 * stored via env vars; issue signed JWT/session cookies over HTTPS.
 */
(function (global) {
  const KEYS = {
    users: "ps5_rental_users",
    session: "ps5_rental_session",
    adminSession: "ps5_rental_admin_session",
    orders: "ps5_rental_orders",
    occupied: "ps5_rental_bookings",
  };

  // TEST ONLY — do not ship plaintext credentials to production
  const ADMIN_CREDENTIALS = {
    phone: "79821415152",
    password: "1234567890",
    name: "Администратор",
  };

  const TEST_CLIENT = {
    fio: "Тестовый Пользователь",
    phone: "79026936225",
    password: "12345678",
    loyaltyStatus: "standard",
  };

  const PICKUP_LOCATION = "г. Казань, ул. Баумана, 15 (Пн–Вс 11:00–21:00)";

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function ensureSeedUsers() {
    const users = readJson(KEYS.users, []);
    if (!users.some((u) => u.phone === TEST_CLIENT.phone)) {
      users.push({ ...TEST_CLIENT });
      writeJson(KEYS.users, users);
    }
    return users;
  }

  function ensureSeedOccupied() {
    let occupied = readJson(KEYS.occupied, null);
    if (occupied) return occupied;
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    occupied = [];
    [3, 10].forEach((offset) => {
      const d = new Date(base);
      d.setDate(d.getDate() + offset);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      occupied.push(`${y}-${m}-${day}`);
    });
    writeJson(KEYS.occupied, occupied);
    return occupied;
  }

  /** POST /api/admin/login — Admin authentication route */
  function adminLogin(phone, password) {
    if (phone === ADMIN_CREDENTIALS.phone && password === ADMIN_CREDENTIALS.password) {
      const session = {
        role: "admin",
        phone: ADMIN_CREDENTIALS.phone,
        name: ADMIN_CREDENTIALS.name,
        loggedInAt: new Date().toISOString(),
      };
      writeJson(KEYS.adminSession, session);
      return { ok: true, session };
    }
    return { ok: false, error: "Неверный телефон или пароль администратора" };
  }

  function adminLogout() {
    localStorage.removeItem(KEYS.adminSession);
  }

  function getAdminSession() {
    return readJson(KEYS.adminSession, null);
  }

  function clientLogin(phone, password) {
    const users = ensureSeedUsers();
    const user = users.find((u) => u.phone === phone && u.password === password);
    if (!user) return { ok: false, error: "Неверный телефон или пароль" };
    const session = {
      role: "client",
      phone: user.phone,
      fio: user.fio,
      loyaltyStatus: user.loyaltyStatus || "standard",
    };
    writeJson(KEYS.session, session);
    return { ok: true, session };
  }

  function clientRegister({ fio, phone, password }) {
    const users = ensureSeedUsers();
    if (users.some((u) => u.phone === phone)) {
      return { ok: false, error: "Такой телефон уже зарегистрирован" };
    }
    const user = { fio, phone, password, loyaltyStatus: "standard" };
    users.push(user);
    writeJson(KEYS.users, users);
    const session = { role: "client", phone, fio, loyaltyStatus: "standard" };
    writeJson(KEYS.session, session);
    return { ok: true, session };
  }

  function clientLogout() {
    localStorage.removeItem(KEYS.session);
  }

  function getClientSession() {
    return readJson(KEYS.session, null);
  }

  function listClients() {
    return ensureSeedUsers().map(({ fio, phone, loyaltyStatus }) => ({
      fio,
      phone,
      loyaltyStatus: loyaltyStatus || "standard",
    }));
  }

  function listOrders() {
    return readJson(KEYS.orders, []);
  }

  function getOccupiedDates() {
    return new Set(ensureSeedOccupied());
  }

  function datesInRange(startKey, endKey) {
    const keys = [];
    const [ys, ms, ds] = startKey.split("-").map(Number);
    const cur = new Date(ys, ms - 1, ds);
    const [ye, me, de] = endKey.split("-").map(Number);
    const end = new Date(ye, me - 1, de);
    // occupy nights from start (inclusive) to end (exclusive)
    while (cur < end) {
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, "0");
      const d = String(cur.getDate()).padStart(2, "0");
      keys.push(`${y}-${m}-${d}`);
      cur.setDate(cur.getDate() + 1);
    }
    return keys;
  }

  function isRangeAvailable(startKey, endKey) {
    const occupied = getOccupiedDates();
    return datesInRange(startKey, endKey).every((k) => !occupied.has(k));
  }

  function createOrder(payload) {
    const orders = listOrders();
    const id = `ORD-${Date.now().toString(36).toUpperCase()}`;
    const order = {
      id,
      customerName: payload.customerName,
      customerPhone: payload.customerPhone,
      startDate: payload.startDate,
      endDate: payload.endDate,
      days: payload.days,
      status: "active",
      totalPrice: payload.totalPrice,
      fulfillment: payload.fulfillment, // delivery | pickup
      deliveryAddress: payload.deliveryAddress || null,
      pickupLocation: payload.fulfillment === "pickup" ? PICKUP_LOCATION : null,
      createdAt: new Date().toISOString(),
    };
    orders.unshift(order);
    writeJson(KEYS.orders, orders);

    const occupied = ensureSeedOccupied();
    datesInRange(payload.startDate, payload.endDate).forEach((k) => {
      if (!occupied.includes(k)) occupied.push(k);
    });
    writeJson(KEYS.occupied, occupied);

    return { ok: true, order };
  }

  // migrate legacy name→fio if needed
  function migrateUsers() {
    const users = readJson(KEYS.users, []);
    let changed = false;
    users.forEach((u) => {
      if (u.name && !u.fio) {
        u.fio = u.name;
        delete u.name;
        changed = true;
      }
      if (u.login && !u.phone) {
        u.phone = u.login;
        delete u.login;
        changed = true;
      }
    });
    if (changed) writeJson(KEYS.users, users);
  }

  migrateUsers();
  ensureSeedUsers();
  ensureSeedOccupied();

  global.BackendAPI = {
    KEYS,
    PICKUP_LOCATION,
    ADMIN_CREDENTIALS_PHONE: ADMIN_CREDENTIALS.phone, // exposed phone only for UI hints
    adminLogin,
    adminLogout,
    getAdminSession,
    clientLogin,
    clientRegister,
    clientLogout,
    getClientSession,
    listClients,
    listOrders,
    getOccupiedDates,
    isRangeAvailable,
    datesInRange,
    createOrder,
  };
})(window);
