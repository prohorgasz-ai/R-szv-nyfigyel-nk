import { NextResponse } from 'next/server'

const CACHE = new Map<string, { price: number; ts: number }>()
const CACHE_TTL = 2 * 60 * 1000 // 2 perc

export async function GET(
  request: Request,
  { params }: { params: { ticker: string } }
) {
  const ticker = params.ticker.toUpperCase()
  const now = Date.now()

  // Cache ellenőrzés
  const cached = CACHE.get(ticker)
  if (cached && now - cached.ts < CACHE_TTL) {
    return NextResponse.json({ price: cached.price })
  }

  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        next: { revalidate: 120 }
      }
    )
    const json = await res.json()
    const price = json?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null

    if (price) {
      CACHE.set(ticker, { price, ts: now })
    }

    return NextResponse.json({ price })
  } catch (error) {
    // Fallback: régi cache ha van
    const stale = CACHE.get(ticker)
    return NextResponse.json({ price: stale?.price ?? null })
  }
}
