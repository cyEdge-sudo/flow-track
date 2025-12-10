import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  // Allow API routes to pass through without redirects
  if (pathname.startsWith('/api')) {
    return supabaseResponse
  }

  // If user is not logged in and is trying to access any route other than /login, redirect to /login
  if (!user && !pathname.startsWith('/login')) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    const resp = NextResponse.redirect(url)
    // copy cookies
    resp.cookies.setAll(supabaseResponse.cookies.getAll())
    return resp
  }

  // If user is logged in and is trying to access /login, redirect to /tasks
  if (user && pathname.startsWith('/login')) {
    const url = request.nextUrl.clone()
    url.pathname = '/tasks'
    const resp = NextResponse.redirect(url)
    resp.cookies.setAll(supabaseResponse.cookies.getAll())
    return resp
  }

  return supabaseResponse
}
