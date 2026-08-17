/**
 * Backend / domain: dynamic pricing & loyalty tiers (section 4)
 *
 * Tiers:
 *  1 day  → 1,200 RUB
 *  2 days → 2,000 RUB
 *  3 days → 2,700 RUB
 *  4–7 days → 2,700 + 700 × (days − 3)
 *  8+ days  → price(7) + 600 × (days − 7)
 */
(function (global) {
  const PRICE_1 = 1200;
  const PRICE_2 = 2000;
  const PRICE_3 = 2700;
  const RATE_AFTER_3 = 700;
  const RATE_AFTER_7 = 600;

  /**
   * @param {number} days - rental duration in full days (min 1 = 24h)
   * @returns {number} total RUB
   */
  function calculateRentalPrice(days) {
    const d = Math.floor(Number(days));
    if (!Number.isFinite(d) || d < 1) return 0;
    if (d === 1) return PRICE_1;
    if (d === 2) return PRICE_2;
    if (d === 3) return PRICE_3;
    if (d <= 7) return PRICE_3 + RATE_AFTER_3 * (d - 3);
    const sevenDayTotal = PRICE_3 + RATE_AFTER_3 * 4; // 5,500
    return sevenDayTotal + RATE_AFTER_7 * (d - 7);
  }

  /**
   * Days between start and end (end exclusive of start count).
   * start=2026-08-16, end=2026-08-17 → 1 day (24h minimum).
   */
  function durationDays(startKey, endKey) {
    if (!startKey || !endKey) return 0;
    const [ys, ms, ds] = startKey.split("-").map(Number);
    const [ye, me, de] = endKey.split("-").map(Number);
    const start = Date.UTC(ys, ms - 1, ds);
    const end = Date.UTC(ye, me - 1, de);
    const diff = Math.round((end - start) / 86400000);
    return diff < 1 ? 0 : diff;
  }

  function describePricing(days) {
    if (days < 1) return "Выберите период";
    if (days === 1) return "Тариф: 1 день — 1 200 ₽";
    if (days === 2) return "Тариф: 2 дня — 2 000 ₽";
    if (days === 3) return "Тариф: 3 дня — 2 700 ₽";
    if (days <= 7) return `Тариф: ${days} дн. — 2 700 ₽ + 700 ₽ × ${days - 3}`;
    return `Тариф: ${days} дн. — цена за 7 дн. + 600 ₽ × ${days - 7}`;
  }

  global.PricingService = {
    calculateRentalPrice,
    durationDays,
    describePricing,
    PRICE_1,
    PRICE_2,
    PRICE_3,
    RATE_AFTER_3,
    RATE_AFTER_7,
  };
})(window);
