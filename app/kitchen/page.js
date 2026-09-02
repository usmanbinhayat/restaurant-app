'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default function KitchenPage() {
    async function logout() {
    document.cookie = 'kitchen_auth=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC'
    window.location.href = '/kitchen/login'
  }
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  async function fetchOrders() {
    // Get all orders that aren't finished yet, with their table number and items
    const { data, error } = await supabase
      .from('orders')
      .select(`
        id,
        status,
        created_at,
        total,
        restaurant_tables ( table_number ),
        order_items (
          id,
          quantity,
          notes,
          menu_items ( name )
        )
      `)
      .in('status', ['pending', 'received', 'preparing'])
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error loading orders:', error)
    } else {
      setOrders(data)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchOrders()
    // Auto-refresh every 5 seconds so the chef sees new orders without reloading
    const interval = setInterval(fetchOrders, 5000)
    return () => clearInterval(interval)
  }, [])

  async function updateStatus(orderId, newStatus) {
    const { error } = await supabase
      .from('orders')
      .update({ status: newStatus })
      .eq('id', orderId)

    if (error) {
      alert('Error updating order status')
      console.error(error)
    } else {
      fetchOrders() // refresh the list immediately
    }
  }

  if (loading) {
    return <p style={{ padding: 20 }}>Loading orders...</p>
  }

  return (
    <div style={{ padding: 20, fontFamily: 'Arial, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
  <h1>Kitchen Orders</h1>
  <button onClick={logout} style={{ padding: '8px 14px', fontSize: 13 }}>Logout</button>
</div>

      {orders.length === 0 && <p>No active orders right now.</p>}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 15,
        }}
      >
        {orders.map((order) => (
          <div
            key={order.id}
            style={{
              border: '1px solid #ccc',
              borderRadius: 8,
              padding: 15,
              background:
                order.status === 'pending'
                  ? '#fff3cd'
                  : order.status === 'received'
                  ? '#cfe2ff'
                  : '#d1e7dd',
            }}
          >
            <h3 style={{ margin: 0 }}>
              Table {order.restaurant_tables?.table_number}
            </h3>
            <p style={{ margin: '5px 0', fontSize: 12, color: '#555' }}>
              Status: <strong>{order.status}</strong>
            </p>

            <ul style={{ paddingLeft: 18 }}>
              {order.order_items.map((item) => (
                <li key={item.id}>
                  {item.quantity}x {item.menu_items?.name}
                  {item.notes && <em> ({item.notes})</em>}
                </li>
              ))}
            </ul>

            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              {order.status === 'pending' && (
                <button
                  onClick={() => updateStatus(order.id, 'received')}
                  style={{ padding: '8px 12px' }}
                >
                  Mark Received
                </button>
              )}
              {order.status === 'received' && (
                <button
                  onClick={() => updateStatus(order.id, 'preparing')}
                  style={{ padding: '8px 12px' }}
                >
                  Start Preparing
                </button>
              )}
              {order.status === 'preparing' && (
                <button
                  onClick={() => updateStatus(order.id, 'ready')}
                  style={{ padding: '8px 12px', background: '#4CAF50', color: 'white', border: 'none' }}
                >
                  Mark Ready
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}