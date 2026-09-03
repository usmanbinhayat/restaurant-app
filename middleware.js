import { NextResponse } from 'next/server'

export function middleware(request) {
  const { pathname } = request.nextUrl

  if (pathname.startsWith('/kitchen') && pathname !== '/kitchen/login') {
    const auth = request.cookies.get('kitchen_auth')
    if (auth?.value !== 'true') {
      return NextResponse.redirect(new URL('/kitchen/login', request.url))
    }
  }

  if (pathname.startsWith('/manager') && pathname !== '/manager/login') {
    const auth = request.cookies.get('manager_auth')
    if (auth?.value !== 'true') {
      return NextResponse.redirect(new URL('/manager/login', request.url))
    }
  }

  if (pathname.startsWith('/admin') && pathname !== '/admin/login') {
    const auth = request.cookies.get('admin_auth')
    if (auth?.value !== 'true') {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/kitchen', '/kitchen/:path*', '/manager', '/manager/:path*', '/admin', '/admin/:path*'],
}