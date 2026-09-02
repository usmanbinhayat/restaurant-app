'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ManagerLogin() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    const res = await fetch('/api/manager-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })

    if (res.ok) {
      router.push('/manager')
      router.refresh()
    } else {
      setError('Wrong password, try again')
    }
  }

  return (
    <div style={{ padding: 20, maxWidth: 300, margin: '100px auto', fontFamily: 'Arial' }}>
      <h2>Manager Login</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="password"
          placeholder="Enter password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: '100%', padding: 10, marginBottom: 10, boxSizing: 'border-box' }}
        />
        <button type="submit" style={{ width: '100%', padding: 10 }}>
          Login
        </button>
      </form>
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  )
}