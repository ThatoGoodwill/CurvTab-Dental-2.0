
 // Information returned by our ASP.NET Core AuthController.
export interface UserProfile {
  id: string
  email: string
  fullName: string
  role: string
  practiceId: string | null
  practiceName: string | null
  mustChangePassword: boolean
}

// Custom error class for handling failed API requests.
export class ApiError extends Error {
  // Stores the HTTP status code, such as 401, 403 or 500.
  status: number

  constructor(status: number, message: string) {
    // Pass the error message to the built-in Error class.
    super(message)

    // Save the HTTP status code on this object.
    this.status = status

    // Identify this error type.
    this.name = 'ApiError'
  }
}

// Central function for communicating with the backend.
export async function apiRequest<T>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' = 'GET',
  data?: unknown
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',

    // Required by our backend's request protection.
    'X-Requested-With': 'XMLHttpRequest',
  }

  if (data !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  // Send requests through the Vite proxy to ASP.NET Core.
  const response = await fetch(`/api${path}`, {
    method,
    headers,
    credentials: 'same-origin',
    body: data === undefined ? undefined : JSON.stringify(data),
  })

  if (!response.ok) {
    const problem = await response.json().catch(() => null)

    throw new ApiError(
      response.status,
      problem?.message || problem?.title || problem?.detail || `Request failed: ${response.status}`
    )
  }

  // Endpoints such as logout return HTTP 204 with no body.
  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

// Methods corresponding to our existing C# AuthController.
export const authApi = {
  login(email: string, password: string) {
    return apiRequest<UserProfile>('/auth/login', 'POST', {
      email,
      password,
    })
  },

  me() {
    return apiRequest<UserProfile>('/auth/me')
  },

  logout() {
    return apiRequest<void>('/auth/logout', 'POST')
  },

  changePassword(currentPassword: string, newPassword: string) {
    return apiRequest<void>('/auth/change-password', 'POST', {
      currentPassword,
      newPassword,
    })
  },
}
