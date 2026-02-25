const CACHE = {};
const CACHE_TTL = 5 * 60 * 1000;

const FINNHUB_KEY = 'd6b2nk9r01qnr27jesl0d6b2nk9r01qnr27jeslg';

const fetchWithTimeout = (url, timeout = 6000) => {
  return Promise.race([
    fetch(url),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeout))
  ]);
};

export const fetchPrice = async (ticker) => {
  const now = Date.now();
  if (CACHE[ticker] && now - CACHE[ticker].ts < CACHE_TTL) {
    return CACHE[ticker].price;
  }
  try {
    const res = await fetchWithTimeout(
      `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_KEY}`,
      6000
    );
    const json = await res.json();
    const price = json?.c || null;
    if (price) {
      CACHE[ticker] = { price, ts: now };
      return price;
    }
    return CACHE[ticker]?.price || null;
  } catch {
    return CACHE[ticker]?.price || null;
  }
};

export const fetchExchangeRates = async () => {
  try {
    const res = await fetchWithTimeout('https://api.frankfurter.app/latest?from=USD&to=HUF,EUR', 5000);
    const json = await res.json();
    return { USD: 1, HUF: json.rates.HUF, EUR: json.rates.EUR };
  } catch {
    return { USD: 1, HUF: 390, EUR: 0.92 };
  }
};

export const convertPrice = (usdAmount, currency, rates) => {
  if (currency === 'USD') return usdAmount;
  if (currency === 'HUF') return usdAmount * rates.HUF;
  if (currency === 'EUR') return usdAmount * rates.EUR;
  return usdAmount;
};

export const formatCurrency = (amount, currency) => {
  if (currency === 'HUF') {
    return new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(amount);
  }
  if (currency === 'EUR') {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(amount);
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(amount);
};

export const formatQuantity = (qty) => {
  return qty % 1 === 0 ? qty.toString() : qty.toFixed(4).replace(/\.?0+$/, '');
};
