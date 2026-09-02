import { NextResponse } from 'next/server'

export async function POST(request) {
  const { password } = await request.json()

  if (password === process.env.KITCHEN_PASSWORD) {
    const response = NextResponse.json({ success: true })
    response.cookies.set('kitchen_auth', 'true', {
      httpOnly: true,
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    })
    return response
  }

  return NextResponse.json({ success: false }, { status: 401 })
}