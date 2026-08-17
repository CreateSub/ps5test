
---

## 1. Frontend Changes

### Calendar (range / week / min 24h)

State in `app.js`:

```js
const state = {
  calendarMode: "range", // or "week"
  startDate: null,
  endDate: null,
  pickStep: "start",
};
// Selecting start auto-sets end = start + 1 day (min 24h)
// Week mode: end = start + 7 days
// Custom range: second click sets end date
```

### Delivery toggle

```html
<input type="radio" name="fulfillment" value="delivery" checked />
<input type="radio" name="fulfillment" value="pickup" />
<!-- address shown only for delivery; pickup shows location note -->
```

### Terms checkbox

```html
<input type="checkbox" id="terms-agree" />
<!-- pay button stays disabled until checked + valid range (+ address if delivery) -->
```

Key files: `index.html`, `app.js`, `styles.css`.

---

## 2. Backend Changes

### Pricing (`js/pricing.js`)

```js
function calculateRentalPrice(days) {
  if (days === 1) return 1200;
  if (days === 2) return 2000;
  if (days === 3) return 2700;
  if (days <= 7) return 2700 + 700 * (days - 3);
  return (2700 + 700 * 4) + 600 * (days - 7); // after 7 days
}
```

### Admin auth route (`js/backend.js`)

```js
// Analog of POST /api/admin/login
function adminLogin(phone, password) { /* hardcoded test check → admin session */ }
```

Orders created via `BackendAPI.createOrder(...)` (persisted in `localStorage`).

---

## 3. Database Schema

Demo storage uses `localStorage` keys; map to SQL as:

```sql
-- clients
CREATE TABLE clients (
  id SERIAL PRIMARY KEY,
  fio TEXT NOT NULL,
  phone VARCHAR(20) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  loyalty_status VARCHAR(32) DEFAULT 'standard'
);

-- admin_sessions (or use JWT; no long-lived DB row required)
CREATE TABLE admin_sessions (
  id UUID PRIMARY KEY,
  admin_phone VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

-- orders
CREATE TABLE orders (
  id VARCHAR(32) PRIMARY KEY,
  customer_name TEXT NOT NULL,
  customer_phone VARCHAR(20) NOT NULL REFERENCES clients(phone),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days INT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  total_price INT NOT NULL,
  fulfillment VARCHAR(16) NOT NULL, -- 'delivery' | 'pickup'
  delivery_address TEXT,            -- required when fulfillment = delivery
  pickup_location TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- occupied calendar nights (optional denormalized index)
CREATE TABLE occupied_dates (
  day DATE PRIMARY KEY
);
```

---

## 4. Security Note

Hardcoded admin password (`1234567890`) is **for testing only**.

In production:

1. Store a **bcrypt** or **argon2** hash (never plaintext).
2. Keep credentials in **environment variables** / a secrets manager — not in source.
3. Authenticate over **HTTPS**; issue a short-lived **JWT** or httpOnly secure cookie.
4. Rate-limit login; lock out after repeated failures.
5. Separate admin routes behind role checks on every request.

---

## Pricing quick reference

| Duration | Total |
|----------|-------|
| 1 day    | 1 200 ₽ |
| 2 days   | 2 000 ₽ |
| 3 days   | 2 700 ₽ |
| 4–7 days | 2 700 + 700 × (n−3) |
| 8+ days  | price(7) + 600 × (n−7) |
