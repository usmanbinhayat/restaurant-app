'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default function PrintBillPage() {
  return (
    <Suspense fallback={<p style={{ padding: 20 }}>Loading…</p>}>
      <PrintBillInner />
    </Suspense>
  )
}

function PrintBillInner() {
  const searchParams = useSearchParams()
  const tableNumber = searchParams.get('table')
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchBill() {
      if (!tableNumber) return
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id,
          created_at,
          total,
          restaurant_tables!inner ( table_number ),
          order_items ( id, quantity, menu_items ( name, price ) )
        `)
        .eq('restaurant_tables.table_number', tableNumber)
        .neq('status', 'paid')
        .order('created_at', { ascending: true })

      if (!error && data) {
        setOrders(data)
      }
      setLoading(false)
    }
    fetchBill()
  }, [tableNumber])

  useEffect(() => {
    if (!loading && orders.length > 0) {
      const timer = setTimeout(() => window.print(), 400)
      return () => clearTimeout(timer)
    }
  }, [loading, orders])

  if (loading) {
    return <p style={{ padding: 20 }}>Loading bill…</p>
  }

  const grandTotal = orders.reduce((sum, o) => sum + Number(o.total || 0), 0)
  const now = new Date()

  return (
    <div style={{ maxWidth: 320, margin: '0 auto', padding: 20, fontFamily: 'monospace', color: '#000' }}>
      <h2 style={{ textAlign: 'center', margin: 0 }}>Katlang Zaika</h2>
      <p style={{ textAlign: 'center', fontSize: 12, margin: '4px 0' }}>
        {now.toLocaleDateString()} {now.toLocaleTimeString()}
      </p>
      <p style={{ textAlign: 'center', fontSize: 14, fontWeight: 'bold', margin: '4px 0' }}>
        Table {tableNumber}
      </p>
      <hr />

      {orders.map((order) => (
        <div key={order.id} style={{ marginBottom: 8 }}>
          {order.order_items.map((item) => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span>{item.quantity}x {item.menu_items?.name}</span>
              <span>Rs. {Number(item.menu_items?.price || 0) * Number(item.quantity || 0)}</span>
            </div>
          ))}
        </div>
      ))}

      <hr />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 'bold' }}>
        <span>Total</span>
        <span>Rs. {grandTotal}</span>
      </div>

      <p style={{ textAlign: 'center', marginTop: 20, fontSize: 12 }}>
        Thank you for dining with us!
      </p>
    </div>
  )
}