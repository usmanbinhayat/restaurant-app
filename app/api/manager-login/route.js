import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export async function POST(request) {
  const { password } = await request.json()

  const { data } = await supabase.from('app_settings').select('manager_password').single()

  if (data && password === data.manager_password) {
    const response = NextResponse.json({ success: true })
    response.cookies.set('manager_auth', 'true', {
      httpOnly: true,
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    })
    return response
  }

  return NextResponse.json({ success: false }, { status: 401 })
}