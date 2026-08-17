/**
 * Frontend state & UI
 * Integrates: calendar range/week (3), delivery toggle (5), terms (6), admin dashboard (2)
 */
(() => {
  const { PricingService, BackendAPI } = window;

  const monthFormatter = new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric",
  });
  const dayFormatter = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    weekday: "short",
  });

  // —— State management ——
  const state = {
    viewYear: null,
    viewMonth: null,
    /** @type {'range'|'week'} */
    calendarMode: "range",
    /** @type {string|null} YYYY-MM-DD */
    startDate: null,
    /** @type {string|null} YYYY-MM-DD — exclusive end / return day */
    endDate: null,
    /** picking 'start' or 'end' in custom range */
    pickStep: "start",
    fulfillment: "delivery", // delivery | pickup
    termsAgreed: false,
  };

  const els = {
    authScreen: document.getElementById("auth-screen"),
    bookingScreen: document.getElementById("booking-screen"),
    adminScreen: document.getElementById("admin-screen"),
    headerActions: document.getElementById("header-actions"),
    userChip: document.getElementById("user-chip"),
    logoutBtn: document.getElementById("logout-btn"),
    loginForm: document.getElementById("login-form"),
    registerForm: document.getElementById("register-form"),
    adminLoginForm: document.getElementById("admin-login-form"),
    loginError: document.getElementById("login-error"),
    registerError: document.getElementById("register-error"),
    adminLoginError: document.getElementById("admin-login-error"),
    calendarDays: document.getElementById("calendar-days"),
    monthLabel: document.getElementById("calendar-month-label"),
    prevMonth: document.getElementById("prev-month"),
    nextMonth: document.getElementById("next-month"),
    calendarHint: document.getElementById("calendar-hint"),
    clearRangeBtn: document.getElementById("clear-range-btn"),
    selectedDatesList: document.getElementById("selected-dates-list"),
    totalPrice: document.getElementById("total-price"),
    pricingNote: document.getElementById("pricing-note"),
    paymentForm: document.getElementById("payment-form"),
    paymentError: document.getElementById("payment-error"),
    payBtn: document.getElementById("pay-btn"),
    deliveryAddressWrap: document.getElementById("delivery-address-wrap"),
    deliveryAddress: document.getElementById("delivery-address"),
    pickupNote: document.getElementById("pickup-note"),
    termsAgree: document.getElementById("terms-agree"),
    toast: document.getElementById("toast"),
    successModal: document.getElementById("success-modal"),
    successText: document.getElementById("success-text"),
    successClose: document.getElementById("success-close"),
    cardNumber: document.getElementById("card-number"),
    cardExpiry: document.getElementById("card-expiry"),
    ordersTbody: document.getElementById("orders-tbody"),
    clientsTbody: document.getElementById("clients-tbody"),
    adminOrdersPanel: document.getElementById("admin-orders-panel"),
    adminClientsPanel: document.getElementById("admin-clients-panel"),
  };

  let toastTimer = null;

  function todayStart() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function toKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function parseKey(key) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function addDays(key, n) {
    const d = parseKey(key);
    d.setDate(d.getDate() + n);
    return toKey(d);
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      els.toast.hidden = true;
    }, 2800);
  }

  function showError(el, message) {
    el.textContent = message;
    el.hidden = !message;
  }

  function hideAllScreens() {
    els.authScreen.hidden = true;
    els.bookingScreen.hidden = true;
    els.adminScreen.hidden = true;
  }

  // —— Auth tabs (client / register / admin) ——
  function switchAuthTab(tab) {
    document.querySelectorAll(".auth-tab").forEach((btn) => {
      const active = btn.dataset.tab === tab;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", String(active));
    });
    els.loginForm.hidden = tab !== "login";
    els.registerForm.hidden = tab !== "register";
    els.adminLoginForm.hidden = tab !== "admin";
    showError(els.loginError, "");
    showError(els.registerError, "");
    showError(els.adminLoginError, "");
  }

  function showAuth() {
    hideAllScreens();
    els.authScreen.hidden = false;
    els.headerActions.hidden = true;
    switchAuthTab("login");
  }

  function resetBookingState() {
    state.startDate = null;
    state.endDate = null;
    state.pickStep = "start";
    state.calendarMode = "range";
    state.fulfillment = "delivery";
    state.termsAgreed = false;
    document.querySelectorAll(".mode-btn").forEach((b) => {
      b.classList.toggle("is-active", b.dataset.mode === "range");
    });
    els.termsAgree.checked = false;
    const deliveryRadio = document.getElementById("opt-delivery");
    if (deliveryRadio) deliveryRadio.checked = true;
    updateFulfillmentUI();
    updateCalendarHint();
  }

  function showBooking(session) {
    hideAllScreens();
    els.bookingScreen.hidden = false;
    els.headerActions.hidden = false;
    els.userChip.textContent = session.fio || session.phone;
    const now = todayStart();
    state.viewYear = now.getFullYear();
    state.viewMonth = now.getMonth();
    resetBookingState();
    renderCalendar();
    updateOrderSummary();
    els.paymentForm.reset();
    document.getElementById("opt-delivery").checked = true;
    updateFulfillmentUI();
    showError(els.paymentError, "");
  }

  function showAdminDashboard() {
    hideAllScreens();
    els.adminScreen.hidden = false;
    els.headerActions.hidden = false;
    const admin = BackendAPI.getAdminSession();
    els.userChip.textContent = admin ? `Админ · ${admin.phone}` : "Админ";
    switchAdminTab("orders");
    renderOrdersTable();
    renderClientsTable();
  }

  // —— Calendar logic (section 3) ——
  function updateCalendarHint() {
    if (state.calendarMode === "week") {
      els.calendarHint.textContent =
        "Режим «неделя»: выберите дату начала — конец автоматически +7 дней.";
      return;
    }
    if (state.pickStep === "start" || !state.startDate) {
      els.calendarHint.textContent =
        "Выберите дату начала — конец по умолчанию +1 день (минимум 24 ч). Затем можно выбрать другой конец.";
    } else {
      els.calendarHint.textContent =
        "Выберите дату окончания (не раньше завтра от начала) или оставьте минимум 24 ч.";
    }
  }

  function setRange(startKey, endKey) {
    if (!startKey || !endKey) {
      state.startDate = null;
      state.endDate = null;
      return;
    }
    if (endKey <= startKey) {
      // enforce min 24h → end = start + 1 day
      endKey = addDays(startKey, 1);
    }
    if (!BackendAPI.isRangeAvailable(startKey, endKey)) {
      showToast("В выбранном периоде есть занятые даты");
      return false;
    }
    state.startDate = startKey;
    state.endDate = endKey;
    return true;
  }

  /**
   * Click handler: custom range OR fill-week start.
   * Min duration: selecting start auto-sets end = start + 1 day.
   */
  function onDayClick(key) {
    const occupied = BackendAPI.getOccupiedDates();
    if (occupied.has(key)) return;

    if (state.calendarMode === "week") {
      // Fill a week: end = start + 7 days
      const end = addDays(key, 7);
      if (setRange(key, end) !== false) {
        state.pickStep = "start";
        renderCalendar();
        updateOrderSummary();
        showToast("Выбрана неделя (7 суток)");
      }
      return;
    }

    // Custom range
    if (state.pickStep === "start" || !state.startDate) {
      // Minimum 24h: end defaults to next day
      if (setRange(key, addDays(key, 1)) !== false) {
        state.pickStep = "end";
        updateCalendarHint();
        renderCalendar();
        updateOrderSummary();
      }
      return;
    }

    // Picking end date
    if (key <= state.startDate) {
      // Restart range from this day
      if (setRange(key, addDays(key, 1)) !== false) {
        state.pickStep = "end";
        renderCalendar();
        updateOrderSummary();
      }
      return;
    }

    if (setRange(state.startDate, key) !== false) {
      state.pickStep = "end";
      renderCalendar();
      updateOrderSummary();
    }
  }

  function clearRange() {
    state.startDate = null;
    state.endDate = null;
    state.pickStep = "start";
    updateCalendarHint();
    renderCalendar();
    updateOrderSummary();
  }

  function isInSelectedRange(key) {
    if (!state.startDate || !state.endDate) return false;
    return key >= state.startDate && key < state.endDate;
  }

  function renderCalendar() {
    const labelDate = new Date(state.viewYear, state.viewMonth, 1);
    els.monthLabel.textContent = monthFormatter.format(labelDate);

    const firstDay = new Date(state.viewYear, state.viewMonth, 1);
    let startWeekday = firstDay.getDay();
    startWeekday = startWeekday === 0 ? 6 : startWeekday - 1;

    const daysInMonth = new Date(state.viewYear, state.viewMonth + 1, 0).getDate();
    const occupied = BackendAPI.getOccupiedDates();
    const today = todayStart();

    els.calendarDays.innerHTML = "";

    for (let i = 0; i < startWeekday; i += 1) {
      const empty = document.createElement("div");
      empty.className = "day-cell empty";
      empty.setAttribute("aria-hidden", "true");
      els.calendarDays.appendChild(empty);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(state.viewYear, state.viewMonth, day);
      const key = toKey(date);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = String(day);
      btn.dataset.date = key;

      const isPast = date < today;
      const isBooked = occupied.has(key);
      const inRange = isInSelectedRange(key);
      const isEdge = key === state.startDate || key === state.endDate;

      btn.className = "day-cell";
      if (isPast) {
        btn.classList.add("past");
        btn.disabled = true;
      } else if (isBooked) {
        btn.classList.add("booked");
        btn.disabled = true;
        btn.title = "Дата занята";
      } else if (inRange || isEdge) {
        btn.classList.add("selected");
        if (isEdge) btn.classList.add("range-edge");
      } else {
        btn.classList.add("available");
      }

      // End date itself is return day — still clickable if not past/booked
      if (!isPast && !isBooked) {
        btn.addEventListener("click", () => onDayClick(key));
      }

      els.calendarDays.appendChild(btn);
    }
  }

  function updateOrderSummary() {
    const days = PricingService.durationDays(state.startDate, state.endDate);
    const total = PricingService.calculateRentalPrice(days);

    els.selectedDatesList.innerHTML = "";
    if (!state.startDate || !state.endDate || days < 1) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = "Период не выбран";
      els.selectedDatesList.appendChild(li);
    } else {
      const rows = [
        ["Начало", dayFormatter.format(parseKey(state.startDate))],
        ["Окончание", dayFormatter.format(parseKey(state.endDate))],
        ["Длительность", `${days} сут. (от 24 ч)`],
      ];
      rows.forEach(([label, value]) => {
        const li = document.createElement("li");
        const a = document.createElement("span");
        a.textContent = label;
        const b = document.createElement("span");
        b.textContent = value;
        li.append(a, b);
        els.selectedDatesList.appendChild(li);
      });
    }

    els.totalPrice.textContent = `${total.toLocaleString("ru-RU")} ₽`;
    els.pricingNote.textContent = PricingService.describePricing(days);
    updatePayButtonState();
  }

  // —— Delivery / Pickup (section 5) ——
  function updateFulfillmentUI() {
    const isDelivery = state.fulfillment === "delivery";
    els.deliveryAddressWrap.hidden = !isDelivery;
    els.pickupNote.hidden = isDelivery;
    els.deliveryAddress.required = isDelivery;
    if (!isDelivery) els.deliveryAddress.value = "";
    updatePayButtonState();
  }

  // —— Terms + pay button gate (section 6) ——
  function updatePayButtonState() {
    const days = PricingService.durationDays(state.startDate, state.endDate);
    const hasRange = days >= 1;
    const termsOk = state.termsAgreed;
    const deliveryOk =
      state.fulfillment === "pickup" ||
      (state.fulfillment === "delivery" && els.deliveryAddress.value.trim().length > 3);
    els.payBtn.disabled = !(hasRange && termsOk && deliveryOk);
  }

  function formatCardNumber(value) {
    const digits = value.replace(/\D/g, "").slice(0, 16);
    return digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
  }

  function formatExpiry(value) {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    if (digits.length <= 2) return digits;
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }

  function validateCard({ number, expiry, cvv, name }) {
    const digits = number.replace(/\s/g, "");
    if (!/^\d{16}$/.test(digits)) return "Введите 16-значный номер карты";
    if (!/^\d{2}\/\d{2}$/.test(expiry)) return "Срок действия в формате ММ/ГГ";
    const [mm, yy] = expiry.split("/").map(Number);
    if (mm < 1 || mm > 12) return "Некорректный месяц на карте";
    const expDate = new Date(2000 + yy, mm, 0);
    if (expDate < todayStart()) return "Срок действия карты истёк";
    if (!/^\d{3,4}$/.test(cvv)) return "CVV — 3 или 4 цифры";
    if (!name.trim() || name.trim().length < 2) return "Укажите имя на карте";
    return "";
  }

  // —— Admin tables (section 2) ——
  function switchAdminTab(tab) {
    document.querySelectorAll(".admin-tab").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.adminTab === tab);
    });
    els.adminOrdersPanel.hidden = tab !== "orders";
    els.adminClientsPanel.hidden = tab !== "clients";
  }

  function renderOrdersTable() {
    const orders = BackendAPI.listOrders().filter((o) => o.status === "active");
    els.ordersTbody.innerHTML = "";
    if (orders.length === 0) {
      els.ordersTbody.innerHTML =
        '<tr><td colspan="6" class="empty-cell">Активных заказов нет</td></tr>';
      return;
    }
    orders.forEach((o) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(o.id)}</td>
        <td>${escapeHtml(o.customerName)}</td>
        <td>${escapeHtml(o.startDate)}</td>
        <td>${escapeHtml(o.endDate)}</td>
        <td><span class="status-pill">${escapeHtml(o.status)}</span></td>
        <td>${Number(o.totalPrice).toLocaleString("ru-RU")} ₽</td>
      `;
      els.ordersTbody.appendChild(tr);
    });
  }

  function renderClientsTable() {
    const clients = BackendAPI.listClients();
    els.clientsTbody.innerHTML = "";
    if (clients.length === 0) {
      els.clientsTbody.innerHTML =
        '<tr><td colspan="2" class="empty-cell">Клиентов пока нет</td></tr>';
      return;
    }
    clients.forEach((c) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(c.fio)}</td>
        <td>${escapeHtml(c.phone)}</td>
      `;
      els.clientsTbody.appendChild(tr);
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // —— Events ——
  document.querySelectorAll(".auth-tab").forEach((btn) => {
    btn.addEventListener("click", () => switchAuthTab(btn.dataset.tab));
  });

  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.calendarMode = btn.dataset.mode;
      document.querySelectorAll(".mode-btn").forEach((b) => {
        b.classList.toggle("is-active", b === btn);
      });
      state.pickStep = "start";
      updateCalendarHint();
      if (state.calendarMode === "week") {
        showToast("Выберите день начала недели");
      }
    });
  });

  els.clearRangeBtn.addEventListener("click", clearRange);

  els.loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const phone = els.loginForm.login.value.trim();
    const password = els.loginForm.password.value;
    const result = BackendAPI.clientLogin(phone, password);
    if (!result.ok) {
      showError(els.loginError, result.error);
      return;
    }
    showBooking(result.session);
    showToast("Добро пожаловать!");
  });

  els.registerForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const fio = els.registerForm.name.value.trim();
    const phone = els.registerForm.login.value.trim();
    const password = els.registerForm.password.value;
    const password2 = els.registerForm.password2.value;

    if (!/^\d{10,11}$/.test(phone)) {
      showError(els.registerError, "Телефон — 10–11 цифр");
      return;
    }
    if (password !== password2) {
      showError(els.registerError, "Пароли не совпадают");
      return;
    }
    if (password.length < 6) {
      showError(els.registerError, "Пароль должен быть не короче 6 символов");
      return;
    }

    const result = BackendAPI.clientRegister({ fio, phone, password });
    if (!result.ok) {
      showError(els.registerError, result.error);
      return;
    }
    showBooking(result.session);
    showToast("Регистрация успешна");
  });

  // Admin authentication → redirect to dashboard
  els.adminLoginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const phone = els.adminLoginForm.phone.value.trim();
    const password = els.adminLoginForm.password.value;
    const result = BackendAPI.adminLogin(phone, password);
    if (!result.ok) {
      showError(els.adminLoginError, result.error);
      return;
    }
    showAdminDashboard();
    showToast("Вход в панель администратора");
  });

  document.querySelectorAll(".admin-tab").forEach((btn) => {
    btn.addEventListener("click", () => switchAdminTab(btn.dataset.adminTab));
  });

  els.logoutBtn.addEventListener("click", () => {
    BackendAPI.clientLogout();
    BackendAPI.adminLogout();
    resetBookingState();
    showAuth();
  });

  els.prevMonth.addEventListener("click", () => {
    state.viewMonth -= 1;
    if (state.viewMonth < 0) {
      state.viewMonth = 11;
      state.viewYear -= 1;
    }
    renderCalendar();
  });

  els.nextMonth.addEventListener("click", () => {
    state.viewMonth += 1;
    if (state.viewMonth > 11) {
      state.viewMonth = 0;
      state.viewYear += 1;
    }
    renderCalendar();
  });

  document.querySelectorAll('input[name="fulfillment"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      state.fulfillment = radio.value;
      updateFulfillmentUI();
    });
  });

  els.deliveryAddress.addEventListener("input", updatePayButtonState);

  els.termsAgree.addEventListener("change", () => {
    state.termsAgreed = els.termsAgree.checked;
    updatePayButtonState();
  });

  els.cardNumber.addEventListener("input", () => {
    els.cardNumber.value = formatCardNumber(els.cardNumber.value);
  });

  els.cardExpiry.addEventListener("input", () => {
    els.cardExpiry.value = formatExpiry(els.cardExpiry.value);
  });

  els.paymentForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const days = PricingService.durationDays(state.startDate, state.endDate);
    if (days < 1) {
      showError(els.paymentError, "Выберите период аренды (минимум 24 часа)");
      return;
    }
    if (!state.termsAgreed) {
      showError(els.paymentError, "Необходимо согласие с условиями использования");
      return;
    }
    if (state.fulfillment === "delivery" && els.deliveryAddress.value.trim().length < 4) {
      showError(els.paymentError, "Укажите адрес доставки");
      return;
    }

    const payload = {
      number: els.cardNumber.value,
      expiry: els.cardExpiry.value,
      cvv: document.getElementById("card-cvv").value,
      name: document.getElementById("card-name").value,
    };
    const cardError = validateCard(payload);
    if (cardError) {
      showError(els.paymentError, cardError);
      return;
    }
    showError(els.paymentError, "");

    const session = BackendAPI.getClientSession();
    const total = PricingService.calculateRentalPrice(days);
    const result = BackendAPI.createOrder({
      customerName: session.fio,
      customerPhone: session.phone,
      startDate: state.startDate,
      endDate: state.endDate,
      days,
      totalPrice: total,
      fulfillment: state.fulfillment,
      deliveryAddress:
        state.fulfillment === "delivery" ? els.deliveryAddress.value.trim() : null,
    });

    const fulfillLabel =
      state.fulfillment === "delivery"
        ? `Доставка: ${els.deliveryAddress.value.trim()}`
        : `Самовывоз: ${BackendAPI.PICKUP_LOCATION}`;

    els.successText.textContent =
      `Заказ ${result.order.id}. Оплачено ${total.toLocaleString("ru-RU")} ₽ ` +
      `за ${days} сут. (${state.startDate} → ${state.endDate}). ${fulfillLabel}.`;
    els.successModal.hidden = false;

    clearRange();
    els.paymentForm.reset();
    document.getElementById("opt-delivery").checked = true;
    state.fulfillment = "delivery";
    state.termsAgreed = false;
    updateFulfillmentUI();
    renderCalendar();
    updateOrderSummary();
  });

  els.successClose.addEventListener("click", () => {
    els.successModal.hidden = true;
  });

  // —— Init / session restore ——
  const adminSession = BackendAPI.getAdminSession();
  const clientSession = BackendAPI.getClientSession();
  if (adminSession) {
    showAdminDashboard();
  } else if (clientSession) {
    showBooking(clientSession);
  } else {
    showAuth();
  }
})();
