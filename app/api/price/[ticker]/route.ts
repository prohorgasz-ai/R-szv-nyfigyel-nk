import { NextResponse } from 'next/server'

export async function GET(request: Request, { params }: { params: { ticker: string } }) {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${params.ticker}?interval=1d&range=1d`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }
    )
    const json = await res.json()
    const price = json?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null
    return NextResponse.json({ price })
  } catch {
    return NextResponse.json({ price: null })
  }
}
