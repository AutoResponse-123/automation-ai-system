import './App.css'
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

export default function App() {
  const [messages, setMessages] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Cargar mensajes iniciales
    loadMessages()
    
    // Suscribirse a cambios en tiempo real
    const subscription = supabase
  .channel('messages')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
    },
    (payload) => {
      setMessages((prev) => [...prev, payload.new])
    }
  )
  .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  async function loadMessages() {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)

    setMessages(data || [])
    setLoading(false)
  }

  return (
    <div style={{ padding: '20px' }}>
      <h1>Dashboard - Mensajes en Vivo</h1>
      
      {loading ? (
        <p>Cargando...</p>
      ) : (
        <div>
          <p>Total mensajes: {messages.length}</p>
          <div style={{ marginTop: '20px' }}>
            {messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  padding: '10px',
                  marginBottom: '10px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  textAlign: 'left',
                }}
              >
                <strong>{msg.sender === 'user' ? 'Cliente' : 'Bot'}:</strong>{' '}
                {msg.content}
                <br />
                <small>{new Date(msg.created_at).toLocaleTimeString()}</small>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}