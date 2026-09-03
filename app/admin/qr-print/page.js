'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { QRCodeCanvas } from 'qrcode.react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default function QRPrintPage() {
  return (
    <Suspense fallback={<p style={{ padding: 20 }}>Loading…</p>}>
      <QRPrintInner />
    </Suspense>
  )
}

function QRCard({ tableNumber, baseUrl }) {
  const url = `${baseUrl}/?table=${tableNumber}`

  return (
    <div
      style={{
        width: 320,
        padding: 24,
        margin: '0 auto 24px auto',
        backgroundColor: '#F3E9D8',
        border: '2px solid #241A14',
        borderRadius: 16,
        textAlign: 'center',
        pageBreakAfter: 'always',
      }}
    >
      <h2 style={{ fontSize: 24, fontStyle: 'italic', color: '#241A14', margin: '0 0 16px 0' }}>
        Katlang Zaika
      </h2>
      <div style={{ background: 'white', display: 'inline-block', padding: 12, borderRadius: 8 }}>
        <QRCodeCanvas value={url} size={220} fgColor="#241A14" bgColor="#ffffff" />
      </div>
      <p style={{ fontSize: 22, fontWeight: 'bold', color: '#A6341D', margin: '16px 0 4px 0' }}>
        Table {tableNumber}
      </p>
      <p style={{ fontSize: 13, color: '#241A14' }}>Scan to view menu & order</p>
    </div>
  )
}

function QRPrintInner() {
  const searchParams = useSearchParams()
  const tableParam = searchParams.get('table')
  const [tables, setTables] = useState([])
  const [loading, setLoading] = useState(true)
  const [baseUrl, setBaseUrl] = useState('')

  useEffect(() => {
    setBaseUrl(window.location.origin)
  }, [])

  useEffect(() => {
    async function fetchTables() {
      if (tableParam === 'all') {
        const { data } = await supabase
          .from('restaurant_tables')
          .select('table_number')
          .order('table_number', { ascending: true })
        if (data) setTables(data.map((t) => t.table_number))
      } else if (tableParam) {
        setTables([Number(tableParam)])
      }
      setLoading(false)
    }
    fetchTables()
  }, [tableParam])

  useEffect(() => {
    if (!loading && baseUrl && tables.length > 0) {
      const timer = setTimeout(() => window.print(), 500)
      return () => clearTimeout(timer)
    }
  }, [loading, baseUrl, tables])

  if (loading || !baseUrl) {
    return <p style={{ padding: 20 }}>Preparing QR codes…</p>
  }

  return (
    <div style={{ padding: 20 }}>
      {tables.map((tableNumber) => (
        <QRCard key={tableNumber} tableNumber={tableNumber} baseUrl={baseUrl} />
      ))}
    </div>
  )
}