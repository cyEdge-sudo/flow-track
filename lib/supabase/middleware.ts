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

    // Copy Supabase cookies to the redirect response (ResponseCookies has no setAll)
    const cookiesToCopy = supabaseResponse.cookies.getAll() as Array<{ name: string; value: string }>
    cookiesToCopy.forEach(({ name, value }) => {
      resp.cookies.set(name, value)
    })

    return resp
  }

  // If user is logged in and is trying to access /login, redirect to /tasks
  if (user && pathname.startsWith('/login')) {
    const url = request.nextUrl.clone()
    url.pathname = '/tasks'
    const resp = NextResponse.redirect(url)

    const cookiesToCopy = supabaseResponse.cookies.getAll() as Array<{ name: string; value: string }>
    cookiesToCopy.forEach(({ name, value }) => {
      resp.cookies.set(name, value)
    })

    return resp
  }

  return supabaseResponse
}
