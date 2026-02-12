import { useEffect, useMemo, useRef, useState } from 'react'
import Modal from './components/Modal.jsx'
import { supabase } from './lib/supabase.js'

const NAV_ITEMS = [
  { id: 'agenda', label: 'Agenda' },
  { id: 'clientes', label: 'Clientes' },
  { id: 'servicos', label: 'Serviços' },
  { id: 'faturamento', label: 'Faturamento' },
]

const STATUS_STYLES = {
  pendente: 'bg-amber-300/15 text-amber-200 border border-amber-300/40',
  confirmado: 'bg-emerald-300/15 text-emerald-200 border border-emerald-300/40',
  concluido: 'bg-red-300/15 text-red-200 border border-red-300/40',
  cancelado: 'bg-gray-300/15 text-gray-200 border border-gray-300/40',
}

const STATUS_LABELS = {
  pendente: 'Agendado',
  confirmado: 'Confirmado',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
}

const CURRENCY = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const createClientForm = () => ({
  nome_completo: '',
  telefone: '',
  endereco: '',
  observacoes: '',
})

const createServiceForm = () => ({
  nome: '',
  valor: '',
  duracao_minutos: '',
  ativo: true,
})

const createAgendamentoForm = (dateValue) => ({
  cliente_id: '',
  servico_id: '',
  data: dateValue,
  hora_inicio: '09:00',
  status: 'pendente',
  endereco_atendimento: '',
  observacoes: '',
  usar_endereco_cliente: true,
})

const toLocalDateInput = (value) => {
  const date = value ? new Date(value) : new Date()
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

const toLocalTimeInput = (value) => {
  const date = new Date(value)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(11, 16)
}

const parseDateValue = (value) => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00`)
  }
  return new Date(value)
}

const formatDate = (value) =>
  new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(parseDateValue(value))

const formatTime = (value) =>
  new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))

const combineDateTime = (date, time) => {
  if (!date || !time) return null
  const local = new Date(`${date}T${time}:00`)
  return local.toISOString()
}

const startOfWeek = (dateValue) => {
  const date = new Date(`${dateValue}T00:00:00`)
  const day = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - day)
  return date
}

const endOfWeek = (dateValue) => {
  const start = startOfWeek(dateValue)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return end
}

const WORK_START_MINUTES = 8 * 60
const WORK_END_MINUTES = 20 * 60
const SLOT_MINUTES = 30

const timeToMinutes = (timeValue) => {
  if (!timeValue) return null
  const [hours, minutes] = timeValue.split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return hours * 60 + minutes
}

const minutesToTime = (minutes) => {
  const safeMinutes = Math.max(0, minutes)
  const hours = String(Math.floor(safeMinutes / 60)).padStart(2, '0')
  const mins = String(safeMinutes % 60).padStart(2, '0')
  return `${hours}:${mins}`
}

const getServicoDuracao = (agendamento, servicos) => {
  return (
    agendamento?.servico?.duracao_minutos ??
    servicos.find((item) => item.id === agendamento?.servico_id)?.duracao_minutos ??
    60
  )
}

const getAppointmentRange = (agendamento, servicos) => {
  const startMinutes = timeToMinutes(toLocalTimeInput(agendamento.data_hora_inicio))
  let endMinutes = timeToMinutes(toLocalTimeInput(agendamento.data_hora_fim))
  if (!Number.isFinite(endMinutes) || endMinutes === startMinutes) {
    const duracao = Number(getServicoDuracao(agendamento, servicos)) || 60
    endMinutes = (startMinutes ?? 0) + duracao
  }
  return {
    start: startMinutes ?? 0,
    end: endMinutes ?? 0,
  }
}

const getOccupiedSlots = (appointmentsForDay, servicos) => {
  return appointmentsForDay
    .filter((item) => item.status !== 'cancelado')
    .map((item) => getAppointmentRange(item, servicos))
    .sort((a, b) => a.start - b.start)
    .map((range) => `${minutesToTime(range.start)} - ${minutesToTime(range.end)}`)
}

const getAvailableTimes = (duration, appointmentsForDay, excludeId, servicos) => {
  const safeDuration = Number(duration) || 0
  const normalizedRanges = appointmentsForDay
    .filter((item) => item.id !== excludeId && item.status !== 'cancelado')
    .map((item) => getAppointmentRange(item, servicos))

  const startLimit = WORK_START_MINUTES
  const endLimit = WORK_END_MINUTES
  const available = []

  if (!safeDuration) return []

  for (let start = startLimit; start + safeDuration <= endLimit; start += SLOT_MINUTES) {
    const end = start + safeDuration
    const hasOverlap = normalizedRanges.some((range) => start < range.end && end > range.start)
    if (!hasOverlap) {
      available.push(minutesToTime(start))
    }
  }

  return available
}

const getPacoteTotalByService = (servico) => {
  if (!servico) return 0

  const explicitTotal = Number(
    servico?.pacote_total ??
      servico?.pacote_quantidade ??
      servico?.quantidade_pacote ??
      servico?.qtd_pacote
  )
  if (Number.isFinite(explicitTotal) && explicitTotal > 1) return explicitTotal

  const nome = String(servico.nome || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (!nome) return 0

  // Regex com exec para ampliar compatibilidade com Safari/iOS.
  const regex = /(\d+)\s*(maos?|pes?)/g
  let match = regex.exec(nome)
  let total = 0

  while (match) {
    total += Number(match[1] || 0)
    match = regex.exec(nome)
  }

  return Number.isFinite(total) && total > 1 ? total : 0
}

export default function App() {
  const [activeTab, setActiveTab] = useState('agenda')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const today = toLocalDateInput(new Date())
  const [selectedDate, setSelectedDate] = useState(today)
  const [agendaMode, setAgendaMode] = useState('dia')
  const [weekFocusDate, setWeekFocusDate] = useState(today)

  const [clientes, setClientes] = useState([])
  const [servicos, setServicos] = useState([])
  const [agendamentos, setAgendamentos] = useState([])

  const [clientSearch, setClientSearch] = useState('')
  const [clientModalOpen, setClientModalOpen] = useState(false)
  const [editingClient, setEditingClient] = useState(null)
  const [clientForm, setClientForm] = useState(createClientForm())

  const [serviceModalOpen, setServiceModalOpen] = useState(false)
  const [editingService, setEditingService] = useState(null)
  const [serviceForm, setServiceForm] = useState(createServiceForm())

  const [agendamentoModalOpen, setAgendamentoModalOpen] = useState(false)
  const [editingAgendamento, setEditingAgendamento] = useState(null)
  const [agendamentoForm, setAgendamentoForm] = useState(createAgendamentoForm(today))
  const [rescheduleTimes, setRescheduleTimes] = useState({})
  const [rescheduleLocks, setRescheduleLocks] = useState({})
  const [editLocks, setEditLocks] = useState({})
  const weekScrollRef = useRef(null)

  const [periodoInicio, setPeriodoInicio] = useState(() => {
    const date = new Date()
    date.setDate(date.getDate() - 29)
    return toLocalDateInput(date)
  })
  const [periodoFim, setPeriodoFim] = useState(today)

  const loadData = async () => {
    setLoading(true)
    setError('')

    const [clientesRes, servicosRes, agendamentosRes] = await Promise.all([
      supabase.from('clientes').select('*').order('nome_completo', { ascending: true }),
      supabase.from('servicos').select('*').order('nome', { ascending: true }),
      supabase
        .from('agendamentos')
        .select('*, cliente:clientes(*), servico:servicos(*)')
        .order('data_hora_inicio', { ascending: true }),
    ])

    if (clientesRes.error || servicosRes.error || agendamentosRes.error) {
      setError('Não foi possível carregar os dados do Supabase.')
      setLoading(false)
      return
    }

    setClientes(clientesRes.data || [])
    setServicos(servicosRes.data || [])
    setAgendamentos(agendamentosRes.data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (agendaMode === 'semana') {
      setWeekFocusDate(selectedDate)
    }
  }, [agendaMode, selectedDate])

  const agendaFiltrada = useMemo(() => {
    if (agendaMode === 'semana') {
      return agendamentos.filter(
        (item) => toLocalDateInput(item.data_hora_inicio) === weekFocusDate
      )
    }

    return agendamentos.filter(
      (item) => toLocalDateInput(item.data_hora_inicio) === selectedDate
    )
  }, [agendamentos, agendaMode, selectedDate, weekFocusDate])

  const agendaAgrupada = useMemo(() => {
    const map = new Map()
    agendaFiltrada.forEach((item) => {
      const dayKey = toLocalDateInput(item.data_hora_inicio)
      if (!map.has(dayKey)) map.set(dayKey, [])
      map.get(dayKey).push(item)
    })
    return Array.from(map.entries()).sort(([a], [b]) => (a > b ? 1 : -1))
  }, [agendaFiltrada])

  const weekDays = useMemo(() => {
    const start = startOfWeek(selectedDate)
    return Array.from({ length: 7 }).map((_, index) => {
      const date = new Date(start)
      date.setDate(start.getDate() + index)
      return toLocalDateInput(date)
    })
  }, [selectedDate])

  const clientesFiltrados = useMemo(() => {
    const term = clientSearch.toLowerCase()
    return clientes.filter(
      (cliente) =>
        cliente.nome_completo.toLowerCase().includes(term) ||
        cliente.telefone.toLowerCase().includes(term)
    )
  }, [clientes, clientSearch])

  const faturamentoFiltrado = useMemo(() => {
    return agendamentos.filter((item) => {
      if (item.status !== 'concluido') return false
      const dateStr = toLocalDateInput(item.data_hora_inicio)
      return dateStr >= periodoInicio && dateStr <= periodoFim
    })
  }, [agendamentos, periodoInicio, periodoFim])

  const totalReceita = faturamentoFiltrado.reduce((total, item) => {
    const valor = item.servico?.valor ?? servicos.find((s) => s.id === item.servico_id)?.valor ?? 0
    return total + Number(valor || 0)
  }, 0)

  const ticketMedio =
    faturamentoFiltrado.length > 0 ? totalReceita / faturamentoFiltrado.length : 0

  const servicosById = useMemo(() => {
    const map = new Map()
    servicos.forEach((item) => map.set(item.id, item))
    return map
  }, [servicos])

  const pacoteConcluidosByKey = useMemo(() => {
    const map = new Map()

    agendamentos.forEach((item) => {
      if (item.status !== 'concluido') return
      if (!item.cliente_id || !item.servico_id) return

      const servico = item.servico ?? servicosById.get(item.servico_id)
      const totalPacote = getPacoteTotalByService(servico)
      if (!totalPacote) return

      const key = `${item.cliente_id}:${item.servico_id}`
      map.set(key, (map.get(key) || 0) + 1)
    })

    return map
  }, [agendamentos, servicosById])

  const resetClientForm = () => setClientForm(createClientForm())
  const resetServiceForm = () => setServiceForm(createServiceForm())
  const resetAgendamentoForm = () => setAgendamentoForm(createAgendamentoForm(selectedDate))

  const openNewClient = () => {
    resetClientForm()
    setEditingClient(null)
    setClientModalOpen(true)
  }

  const openEditClient = (cliente) => {
    setEditingClient(cliente)
    setClientForm({
      nome_completo: cliente.nome_completo || '',
      telefone: cliente.telefone || '',
      endereco: cliente.endereco || '',
      observacoes: cliente.observacoes || '',
    })
    setClientModalOpen(true)
  }

  const saveClient = async () => {
    if (!clientForm.nome_completo.trim() || !clientForm.telefone.trim()) {
      setError('Preencha nome e telefone da cliente.')
      return
    }

    const payload = {
      nome_completo: clientForm.nome_completo.trim(),
      telefone: clientForm.telefone.trim(),
      endereco: clientForm.endereco.trim() || null,
      observacoes: clientForm.observacoes.trim() || null,
    }

    const response = editingClient
      ? await supabase.from('clientes').update(payload).eq('id', editingClient.id)
      : await supabase.from('clientes').insert(payload)

    if (response.error) {
      setError('Não foi possível salvar a cliente.')
      return
    }

    setClientModalOpen(false)
    resetClientForm()
    await loadData()
  }

  const deleteClient = async () => {
    if (!editingClient) return

    const confirmed = window.confirm(
      `Tem certeza que deseja excluir a cliente "${editingClient.nome_completo}"?`
    )
    if (!confirmed) return

    const response = await supabase.from('clientes').delete().eq('id', editingClient.id)

    if (response.error) {
      if (response.error.code === '23503') {
        setError('Não foi possível excluir: a cliente possui agendamentos vinculados.')
      } else {
        setError('Não foi possível excluir a cliente.')
      }
      return
    }

    setClientModalOpen(false)
    setEditingClient(null)
    resetClientForm()
    await loadData()
  }

  const openNewService = () => {
    resetServiceForm()
    setEditingService(null)
    setServiceModalOpen(true)
  }

  const openEditService = (servico) => {
    setEditingService(servico)
    setServiceForm({
      nome: servico.nome || '',
      valor: servico.valor ?? '',
      duracao_minutos: servico.duracao_minutos ?? '',
      ativo: servico.ativo ?? true,
    })
    setServiceModalOpen(true)
  }

  const saveService = async () => {
    if (!serviceForm.nome.trim()) {
      setError('Informe o nome do serviço.')
      return
    }
    const valor = Number(String(serviceForm.valor).replace(',', '.'))
    const duracao = Number(serviceForm.duracao_minutos)

    if (!valor || !duracao) {
      setError('Informe valor e duração válidos.')
      return
    }

    const payload = {
      nome: serviceForm.nome.trim(),
      valor,
      duracao_minutos: duracao,
      ativo: Boolean(serviceForm.ativo),
    }

    const response = editingService
      ? await supabase.from('servicos').update(payload).eq('id', editingService.id)
      : await supabase.from('servicos').insert(payload)

    if (response.error) {
      setError('Não foi possível salvar o serviço.')
      return
    }

    setServiceModalOpen(false)
    resetServiceForm()
    await loadData()
  }

  const toggleServiceStatus = async (servico) => {
    const response = await supabase
      .from('servicos')
      .update({ ativo: !servico.ativo })
      .eq('id', servico.id)

    if (response.error) {
      setError('Não foi possível atualizar o serviço.')
      return
    }
    await loadData()
  }

  const openNewAgendamento = () => {
    resetAgendamentoForm()
    setEditingAgendamento(null)
    setAgendamentoModalOpen(true)
  }

  const openEditAgendamento = (agendamento) => {
    setEditingAgendamento(agendamento)
    setAgendamentoForm({
      cliente_id: agendamento.cliente_id || '',
      servico_id: agendamento.servico_id || '',
      data: toLocalDateInput(agendamento.data_hora_inicio),
      hora_inicio: toLocalTimeInput(agendamento.data_hora_inicio),
      status: agendamento.status || 'pendente',
      endereco_atendimento: agendamento.endereco_atendimento || '',
      observacoes: agendamento.observacoes || '',
      usar_endereco_cliente: false,
    })
    setAgendamentoModalOpen(true)
  }

  const updateAgendamentoField = (field, value) => {
    setAgendamentoForm((prev) => {
      const next = { ...prev, [field]: value }
      if (field === 'cliente_id' && next.usar_endereco_cliente) {
        const cliente = clientes.find((item) => item.id === value)
        next.endereco_atendimento = cliente?.endereco || ''
      }
      if (field === 'usar_endereco_cliente' && value) {
        const cliente = clientes.find((item) => item.id === next.cliente_id)
        next.endereco_atendimento = cliente?.endereco || ''
      }
      return next
    })
  }

  const horarioFim = useMemo(() => {
    const servico = servicos.find((item) => item.id === agendamentoForm.servico_id)
    if (!servico || !agendamentoForm.data || !agendamentoForm.hora_inicio) return ''
    const start = new Date(`${agendamentoForm.data}T${agendamentoForm.hora_inicio}:00`)
    const end = new Date(start.getTime() + servico.duracao_minutos * 60000)
    return formatTime(end)
  }, [agendamentoForm, servicos])

  const saveAgendamento = async () => {
    if (!agendamentoForm.cliente_id || !agendamentoForm.servico_id) {
      setError('Selecione cliente e serviço.')
      return
    }
    if (!agendamentoForm.data || !agendamentoForm.hora_inicio) {
      setError('Informe data e hora de início.')
      return
    }
    if (!agendamentoForm.endereco_atendimento.trim()) {
      setError('Informe o endereço do atendimento.')
      return
    }

    const servico = servicos.find((item) => item.id === agendamentoForm.servico_id)
    const originalDate = editingAgendamento
      ? toLocalDateInput(editingAgendamento.data_hora_inicio)
      : null
    const originalTime = editingAgendamento
      ? toLocalTimeInput(editingAgendamento.data_hora_inicio)
      : null
    const timeChanged =
      editingAgendamento &&
      (originalDate !== agendamentoForm.data || originalTime !== agendamentoForm.hora_inicio)
    const inicio = combineDateTime(agendamentoForm.data, agendamentoForm.hora_inicio)
    const fim = servico
      ? new Date(
          new Date(`${agendamentoForm.data}T${agendamentoForm.hora_inicio}:00`).getTime() +
            servico.duracao_minutos * 60000
        ).toISOString()
      : combineDateTime(agendamentoForm.data, agendamentoForm.hora_inicio)

    const payload = {
      cliente_id: agendamentoForm.cliente_id,
      servico_id: agendamentoForm.servico_id,
      data_hora_inicio: inicio,
      data_hora_fim: fim,
      endereco_atendimento: agendamentoForm.endereco_atendimento.trim(),
      status: agendamentoForm.status,
      observacoes: agendamentoForm.observacoes.trim() || null,
    }

    const response = editingAgendamento
      ? await supabase.from('agendamentos').update(payload).eq('id', editingAgendamento.id)
      : await supabase.from('agendamentos').insert(payload)

    if (response.error) {
      setError('Não foi possível salvar o agendamento.')
      return
    }

    if (editingAgendamento && timeChanged) {
      setEditLocks((prev) => ({ ...prev, [editingAgendamento.id]: true }))
      setRescheduleLocks((prev) => ({ ...prev, [editingAgendamento.id]: false }))
    }

    setAgendamentoModalOpen(false)
    resetAgendamentoForm()
    await loadData()
  }

  const servicosAtivos = servicos.filter((servico) => servico.ativo)

  const scrollWeek = (direction) => {
    const container = weekScrollRef.current
    if (!container) return
    const amount = Math.max(220, Math.floor(container.clientWidth * 0.8))
    container.scrollBy({ left: direction * amount, behavior: 'smooth' })
  }

  const updateRescheduleTime = (id, value) => {
    setRescheduleTimes((prev) => ({ ...prev, [id]: value }))
  }

  const saveReschedule = async (agendamento, newTime) => {
    const currentTime = toLocalTimeInput(agendamento.data_hora_inicio)
    if (!newTime || newTime === currentTime) return

    const dateKey = toLocalDateInput(agendamento.data_hora_inicio)
    const duracao = Number(getServicoDuracao(agendamento, servicos)) || 60
    const dayAppointments = agendamentos.filter(
      (item) => toLocalDateInput(item.data_hora_inicio) === dateKey
    )
    const availableTimes = getAvailableTimes(duracao, dayAppointments, agendamento.id, servicos)
    if (!availableTimes.includes(newTime)) {
      setError('Horário indisponível para essa duração.')
      return
    }
    const inicio = combineDateTime(dateKey, newTime)
    const fim = new Date(
      new Date(`${dateKey}T${newTime}:00`).getTime() + duracao * 60000
    ).toISOString()

    const response = await supabase
      .from('agendamentos')
      .update({ data_hora_inicio: inicio, data_hora_fim: fim })
      .eq('id', agendamento.id)

    if (response.error) {
      setError('Não foi possível trocar o horário.')
      return
    }

    setRescheduleLocks((prev) => ({ ...prev, [agendamento.id]: true }))
    setEditLocks((prev) => ({ ...prev, [agendamento.id]: false }))
    setRescheduleTimes((prev) => {
      const next = { ...prev }
      delete next[agendamento.id]
      return next
    })
    await loadData()
  }

  return (
    <div className="min-h-screen">
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-sky-400/20 blur-3xl" />
        <div className="pointer-events-none absolute right-0 top-40 h-64 w-64 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-72 w-72 rounded-full bg-rose-400/10 blur-3xl" />

        <div className="mx-auto flex min-h-screen w-full max-w-5xl justify-center gap-6 px-4 py-6 md:px-8">
          <aside className="hidden w-64 flex-col gap-6 md:flex">
            <nav className="glass-panel rounded-3xl p-3">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${
                    activeTab === item.id
                      ? 'bg-white/20 text-white shadow-glow'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </aside>

          <div className="w-full max-w-4xl flex flex-col gap-6">
            <header className="glass-panel flex items-center justify-between gap-4 rounded-3xl px-4 py-4 md:px-6">
              <div>
                <p className="label">Bem-vinda</p>
                <h2 className="text-lg font-semibold md:text-2xl"> Aline</h2>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="btn-outline md:hidden"
                  onClick={() => setDrawerOpen(true)}
                >
                  Menu
                </button>
                <button type="button" className="btn-primary" onClick={openNewAgendamento}>
                  Novo agendamento
                </button>
              </div>
            </header>

            {error ? (
              <div className="glass-panel rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                {error}
              </div>
            ) : null}

            {loading ? (
              <div className="glass-panel rounded-2xl px-6 py-12 text-center text-white/60">
                Carregando dados...
              </div>
            ) : null}

            {!loading && activeTab === 'agenda' ? (
              <section className="space-y-6">
                <div className="glass-card rounded-3xl p-4 md:p-6">
                  <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div>
                      <p className="label">Agenda</p>
                      <h3 className="text-xl font-semibold">Calendário {agendaMode}</h3>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setAgendaMode('dia')}
                        className={`btn-outline ${agendaMode === 'dia' ? 'bg-white/20' : ''}`}
                      >
                        Dia
                      </button>
                      <button
                        type="button"
                        onClick={() => setAgendaMode('semana')}
                        className={`btn-outline ${agendaMode === 'semana' ? 'bg-white/20' : ''}`}
                      >
                        Semana
                      </button>
                      <input
                        type="date"
                        className="input min-w-[160px]"
                        value={selectedDate}
                        onChange={(event) => setSelectedDate(event.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {agendaMode === 'semana' ? (
                  <div className="glass-panel rounded-3xl p-4 md:p-6">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <h4 className="text-lg font-semibold">Visão rápida da semana</h4>
                        <span className="text-xs text-white/60">
                          Arraste para o lado para ver todos os dias.
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="btn-outline"
                          onClick={() => scrollWeek(-1)}
                        >
                          ‹
                        </button>
                        <button
                          type="button"
                          className="btn-outline"
                          onClick={() => scrollWeek(1)}
                        >
                          ›
                        </button>
                      </div>
                    </div>
                    <div
                      ref={weekScrollRef}
                      className="mt-4 flex gap-3 overflow-x-auto pb-2 pt-1 snap-x snap-mandatory cursor-grab active:cursor-grabbing"
                    >
                      {weekDays.map((dayKey) => {
                        const dayItems = agendamentos.filter(
                          (item) => toLocalDateInput(item.data_hora_inicio) === dayKey
                        )
                        const slots = getOccupiedSlots(dayItems, servicos)
                        const isFocused = weekFocusDate === dayKey
                        return (
                          <button
                            key={dayKey}
                            type="button"
                            onClick={() => {
                              setSelectedDate(dayKey)
                              setWeekFocusDate(dayKey)
                            }}
                            className={`glass-card min-w-[220px] snap-start rounded-2xl p-4 text-left transition ${
                              isFocused ? 'border border-sky-300/50 bg-white/15' : ''
                            }`}
                          >
                            <p className="text-sm font-semibold">{formatDate(dayKey)}</p>
                            <p className="text-xs text-white/50">{dayItems.length} ocupados</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {slots.length === 0 ? (
                                <span className="text-xs text-white/40">Livre</span>
                              ) : (
                                slots.map((slot) => (
                                  <span
                                    key={`${dayKey}-${slot}`}
                                    className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] text-white/70"
                                  >
                                    {slot}
                                  </span>
                                ))
                              )}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : null}

                <div className="space-y-4">
                  {agendaAgrupada.length === 0 ? (
                    <div className="glass-panel rounded-2xl px-6 py-8 text-center text-white/60">
                      {agendaMode === 'semana'
                        ? 'Nenhum agendamento para o dia selecionado.'
                        : 'Nenhum agendamento neste período.'}
                    </div>
                  ) : null}

                  {agendaAgrupada.map(([dayKey, itens]) => {
                    const occupiedSlots = getOccupiedSlots(itens, servicos)
                    return (
                      <div key={dayKey} className="glass-panel rounded-3xl p-4 md:p-6">
                        <div className="flex items-center justify-between">
                          <h4 className="text-lg font-semibold">{formatDate(dayKey)}</h4>
                          <span className="text-xs text-white/60">{itens.length} atendimentos</span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {occupiedSlots.length === 0 ? (
                            <span className="text-xs text-white/50">Sem horários ocupados.</span>
                          ) : (
                            occupiedSlots.map((slot) => (
                              <span
                                key={`${dayKey}-${slot}`}
                                className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] text-white/70"
                              >
                                {slot}
                              </span>
                            ))
                          )}
                        </div>
                        <div className="mt-4 space-y-3">
                          {itens.map((item) => {
                            const duracao = getServicoDuracao(item, servicos)
                            const servicoAgendamento = item.servico ?? servicosById.get(item.servico_id)
                            const totalPacote = getPacoteTotalByService(servicoAgendamento)
                            const pacoteKey =
                              totalPacote && item.cliente_id && item.servico_id
                                ? `${item.cliente_id}:${item.servico_id}`
                                : ''
                            const totalConcluidosPacote = pacoteKey
                              ? pacoteConcluidosByKey.get(pacoteKey) || 0
                              : 0
                            const progressoPacoteAtual =
                              totalConcluidosPacote > 0
                                ? ((totalConcluidosPacote - 1) % totalPacote) + 1
                                : 0
                            const pacoteConcluido =
                              totalPacote > 0 &&
                              totalConcluidosPacote > 0 &&
                              totalConcluidosPacote % totalPacote === 0
                            const availableTimes = getAvailableTimes(
                              duracao,
                              itens,
                              item.id,
                              servicos
                            )
                            const currentTime = toLocalTimeInput(item.data_hora_inicio)
                            const selectedTime = rescheduleTimes[item.id] || currentTime
                            const times = availableTimes.includes(currentTime)
                              ? availableTimes
                              : [currentTime, ...availableTimes]
                            const sortedTimes = times
                              .filter(Boolean)
                              .sort((a, b) => timeToMinutes(a) - timeToMinutes(b))
                            const isCanceled = item.status === 'cancelado'
                            const isRescheduleLocked = Boolean(rescheduleLocks[item.id])
                            const isEditLocked = Boolean(editLocks[item.id])
                            const canSave =
                              selectedTime &&
                              selectedTime !== currentTime &&
                              !isCanceled &&
                              !isRescheduleLocked
                            const hasAlternatives = availableTimes.some((time) => time !== currentTime)

                            return (
                              <div
                                key={item.id}
                                className="glass-card flex flex-col gap-4 rounded-2xl px-4 py-4 md:flex-row md:items-center md:justify-between"
                              >
                                <div>
                                  <p className="text-sm text-white/60">
                                    {formatTime(item.data_hora_inicio)} ·{' '}
                                    {item.servico?.nome || 'Serviço'}
                                  </p>
                                  <p className="text-base font-semibold">
                                    {item.cliente?.nome_completo || 'Cliente'}
                                  </p>
                                  <p className="text-xs text-white/50">{item.endereco_atendimento}</p>
                                  {totalPacote > 0 ? (
                                    <div className="mt-2 space-y-1">
                                      <p className="text-[11px] uppercase tracking-[0.12em] text-white/55">
                                        Pacote {progressoPacoteAtual}/{totalPacote}
                                      </p>
                                      <div className="flex flex-wrap gap-2">
                                        {Array.from({ length: totalPacote }).map((_, index) => {
                                          const checked = index < progressoPacoteAtual
                                          return (
                                            <span
                                              key={`${item.id}-pacote-${index}`}
                                              className={`flex h-6 w-6 items-center justify-center rounded-md border text-xs font-bold ${
                                                checked
                                                  ? 'border-emerald-300/70 bg-emerald-300/20 text-emerald-100'
                                                  : 'border-white/20 bg-white/5 text-white/30'
                                              }`}
                                            >
                                              {checked ? '✓' : ''}
                                            </span>
                                          )
                                        })}
                                      </div>
                                      {pacoteConcluido ? (
                                        <p className="text-[11px] text-emerald-200/80">
                                          Pacote concluído.
                                        </p>
                                      ) : (
                                        <p className="text-[11px] text-white/40">
                                          O tick marca quando o atendimento fica concluído.
                                        </p>
                                      )}
                                    </div>
                                  ) : null}
                                </div>
                                <div className="flex flex-col gap-3 md:items-end">
                                  <div className="flex flex-wrap items-center gap-3">
                                    <span className={`badge ${STATUS_STYLES[item.status]}`}>
                                      {STATUS_LABELS[item.status]}
                                    </span>
                                    {item.cliente?.telefone ? (
                                      <a
                                        className="btn-success"
                                        href={`https://wa.me/${item.cliente.telefone.replace(/\D/g, '')}?text=${encodeURIComponent(
                                          `Olá ${item.cliente?.nome_completo || ''} podemos confirmar nosso horário ${formatDate(
                                            item.data_hora_inicio
                                          )} - ${formatTime(item.data_hora_inicio)}`
                                        )}`}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        Confirmar horário
                                      </a>
                                    ) : (
                                      <button type="button" className="btn-success" disabled>
                                        Confirmar horário
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      className="btn-outline"
                                      disabled={isEditLocked}
                                      onClick={() => openEditAgendamento(item)}
                                    >
                                      Editar
                                    </button>
                                  </div>
                                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                    <span className="text-xs text-white/60">Trocar horário</span>
                                    {isCanceled ? (
                                      <span className="text-xs text-white/40">
                                        Agendamento cancelado
                                      </span>
                                    ) : sortedTimes.length === 0 ? (
                                      <span className="text-xs text-white/40">
                                        Sem horários disponíveis
                                      </span>
                                    ) : (
                                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                        <select
                                          className="input sm:w-36"
                                          value={selectedTime}
                                          disabled={isCanceled || isRescheduleLocked}
                                          onChange={(event) =>
                                            updateRescheduleTime(item.id, event.target.value)
                                          }
                                        >
                                          {sortedTimes.map((time) => (
                                            <option key={time} value={time}>
                                              {time}
                                            </option>
                                          ))}
                                        </select>
                                        {!hasAlternatives ? (
                                          <span className="text-xs text-white/40">
                                            Sem outros horários
                                          </span>
                                        ) : null}
                                        <button
                                          type="button"
                                          className="btn-outline"
                                          disabled={!canSave}
                                          onClick={() => saveReschedule(item, selectedTime)}
                                        >
                                          Salvar horário
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            ) : null}

            {!loading && activeTab === 'clientes' ? (
              <section className="space-y-6">
                <div className="glass-card rounded-3xl p-4 md:p-6">
                  <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div>
                      <p className="label">Clientes</p>
                      <h3 className="text-xl font-semibold">Cadastro inteligente</h3>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <input
                        className="input min-w-[200px]"
                        placeholder="Buscar por nome ou telefone"
                        value={clientSearch}
                        onChange={(event) => setClientSearch(event.target.value)}
                      />
                      <button type="button" className="btn-primary" onClick={openNewClient}>
                        Nova cliente
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {clientesFiltrados.map((cliente) => (
                    <div key={cliente.id} className="glass-panel rounded-3xl p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-lg font-semibold">{cliente.nome_completo}</p>
                          <p className="text-sm text-white/60">{cliente.telefone}</p>
                          {cliente.endereco ? (
                            <p className="mt-2 text-xs text-white/50">{cliente.endereco}</p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className="btn-outline"
                          onClick={() => openEditClient(cliente)}
                        >
                          Editar
                        </button>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <a
                          className="btn-ghost"
                          href={`https://wa.me/${cliente.telefone.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          WhatsApp
                        </a>
                        {cliente.observacoes ? (
                          <span className="text-xs text-white/50">{cliente.observacoes}</span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
            {!loading && activeTab === 'servicos' ? (
              <section className="space-y-6">
                <div className="glass-card rounded-3xl p-4 md:p-6">
                  <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div>
                      <p className="label">Serviços</p>
                      <h3 className="text-xl font-semibold">Catálogo de procedimentos</h3>
                    </div>
                    <button type="button" className="btn-primary" onClick={openNewService}>
                      Novo serviço
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  {servicos.map((servico) => (
                    <div key={servico.id} className="glass-panel rounded-3xl p-5">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-lg font-semibold">{servico.nome}</p>
                          <p className="text-sm text-white/60">
                            {servico.duracao_minutos} min · {CURRENCY.format(servico.valor)}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <span
                            className={`badge ${
                              servico.ativo
                                ? 'bg-emerald-300/15 text-emerald-200'
                                : 'bg-white/10 text-white/60'
                            }`}
                          >
                            {servico.ativo ? 'Ativo' : 'Inativo'}
                          </span>
                          <button
                            type="button"
                            className="btn-outline"
                            onClick={() => toggleServiceStatus(servico)}
                          >
                            {servico.ativo ? 'Desativar' : 'Ativar'}
                          </button>
                          <button
                            type="button"
                            className="btn-outline"
                            onClick={() => openEditService(servico)}
                          >
                            Editar
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {!loading && activeTab === 'faturamento' ? (
              <section className="space-y-6">
                <div className="glass-card rounded-3xl p-4 md:p-6">
                  <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div>
                      <p className="label">Faturamento</p>
                      <h3 className="text-xl font-semibold">Resumo financeiro</h3>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <input
                        type="date"
                        className="input min-w-[140px]"
                        value={periodoInicio}
                        onChange={(event) => setPeriodoInicio(event.target.value)}
                      />
                      <input
                        type="date"
                        className="input min-w-[140px]"
                        value={periodoFim}
                        onChange={(event) => setPeriodoFim(event.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="glass-panel rounded-3xl p-5">
                    <p className="label">Receita</p>
                    <p className="mt-2 text-2xl font-semibold">{CURRENCY.format(totalReceita)}</p>
                    <p className="mt-2 text-xs text-white/60">Somente atendimentos concluídos.</p>
                  </div>
                  <div className="glass-panel rounded-3xl p-5">
                    <p className="label">Atendimentos</p>
                    <p className="mt-2 text-2xl font-semibold">{faturamentoFiltrado.length}</p>
                    <p className="mt-2 text-xs text-white/60">No período selecionado.</p>
                  </div>
                  <div className="glass-panel rounded-3xl p-5">
                    <p className="label">Ticket médio</p>
                    <p className="mt-2 text-2xl font-semibold">{CURRENCY.format(ticketMedio)}</p>
                    <p className="mt-2 text-xs text-white/60">Receita média por atendimento.</p>
                  </div>
                </div>

                <div className="glass-panel rounded-3xl p-5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-lg font-semibold">Histórico</h4>
                    <span className="text-xs text-white/60">
                      {faturamentoFiltrado.length} registros
                    </span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {faturamentoFiltrado.map((item) => (
                      <div
                        key={item.id}
                        className="glass-card flex flex-col gap-2 rounded-2xl px-4 py-3 md:flex-row md:items-center md:justify-between"
                      >
                        <div>
                          <p className="text-sm text-white/60">
                            {formatDate(item.data_hora_inicio)} · {formatTime(item.data_hora_inicio)}
                          </p>
                          <p className="text-base font-semibold">
                            {item.cliente?.nome_completo || 'Cliente'} ·{' '}
                            {item.servico?.nome || 'Serviço'}
                          </p>
                        </div>
                        <p className="text-base font-semibold text-emerald-200">
                          {CURRENCY.format(
                            item.servico?.valor ??
                              servicos.find((s) => s.id === item.servico_id)?.valor ??
                              0
                          )}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            ) : null}
          </div>
        </div>
      </div>

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
            role="button"
            tabIndex={0}
          />
          <div className="relative z-10 h-full w-72 space-y-6 bg-slate-950/90 p-6 backdrop-blur-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="label">Menu</p>
                <p className="text-lg font-semibold">Agenda Manicure</p>
              </div>
              <button type="button" className="btn-ghost" onClick={() => setDrawerOpen(false)}>
                Fechar
              </button>
            </div>
            <nav className="space-y-2">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.id)
                    setDrawerOpen(false)
                  }}
                  className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${
                    activeTab === item.id
                      ? 'bg-white/20 text-white shadow-glow'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </div>
        </div>
      ) : null}

      <Modal
        open={clientModalOpen}
        title={editingClient ? 'Editar cliente' : 'Nova cliente'}
        onClose={() => setClientModalOpen(false)}
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            {editingClient ? (
              <button
                type="button"
                className="btn border border-red-300/60 text-red-200 hover:bg-red-300/10"
                onClick={deleteClient}
              >
                Excluir cliente
              </button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-3">
            <button type="button" className="btn-outline" onClick={() => setClientModalOpen(false)}>
              Cancelar
            </button>
            <button type="button" className="btn-primary" onClick={saveClient}>
              Salvar
            </button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">Nome completo</label>
            <input
              className="input"
              value={clientForm.nome_completo}
              onChange={(event) =>
                setClientForm((prev) => ({ ...prev, nome_completo: event.target.value }))
              }
              placeholder="Digite o nome da cliente"
            />
          </div>
          <div>
            <label className="label">WhatsApp</label>
            <input
              className="input"
              value={clientForm.telefone}
              onChange={(event) =>
                setClientForm((prev) => ({ ...prev, telefone: event.target.value }))
              }
              placeholder="(11) 99999-9999"
            />
          </div>
          <div>
            <label className="label">Endereço (opcional)</label>
            <input
              className="input"
              value={clientForm.endereco}
              onChange={(event) =>
                setClientForm((prev) => ({ ...prev, endereco: event.target.value }))
              }
              placeholder="Rua, número, bairro"
            />
          </div>
          <div>
            <label className="label">Observações</label>
            <textarea
              className="input min-h-[90px]"
              value={clientForm.observacoes}
              onChange={(event) =>
                setClientForm((prev) => ({ ...prev, observacoes: event.target.value }))
              }
              placeholder="Preferências, alergias ou avisos"
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={serviceModalOpen}
        title={editingService ? 'Editar serviço' : 'Novo serviço'}
        onClose={() => setServiceModalOpen(false)}
        footer={
          <>
            <button
              type="button"
              className="btn-outline"
              onClick={() => setServiceModalOpen(false)}
            >
              Cancelar
            </button>
            <button type="button" className="btn-primary" onClick={saveService}>
              Salvar
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">Nome do serviço</label>
            <input
              className="input"
              value={serviceForm.nome}
              onChange={(event) => setServiceForm((prev) => ({ ...prev, nome: event.target.value }))}
              placeholder="Spa dos pés, esmaltação"
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">Valor</label>
              <input
                className="input"
                value={serviceForm.valor}
                onChange={(event) =>
                  setServiceForm((prev) => ({ ...prev, valor: event.target.value }))
                }
                placeholder="120"
              />
            </div>
            <div>
              <label className="label">Duração (min)</label>
              <input
                className="input"
                value={serviceForm.duracao_minutos}
                onChange={(event) =>
                  setServiceForm((prev) => ({ ...prev, duracao_minutos: event.target.value }))
                }
                placeholder="90"
              />
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={agendamentoModalOpen}
        title={editingAgendamento ? 'Editar agendamento' : 'Novo agendamento'}
        onClose={() => setAgendamentoModalOpen(false)}
        footer={
          <>
            <button
              type="button"
              className="btn-outline"
              onClick={() => setAgendamentoModalOpen(false)}
            >
              Cancelar
            </button>
            <button type="button" className="btn-primary" onClick={saveAgendamento}>
              Salvar
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">Cliente</label>
            <select
              className="input"
              value={agendamentoForm.cliente_id}
              onChange={(event) => updateAgendamentoField('cliente_id', event.target.value)}
            >
              <option value="">Selecione a cliente</option>
              {clientes.map((cliente) => (
                <option key={cliente.id} value={cliente.id}>
                  {cliente.nome_completo}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Serviço</label>
            <select
              className="input"
              value={agendamentoForm.servico_id}
              onChange={(event) => updateAgendamentoField('servico_id', event.target.value)}
            >
              <option value="">Selecione o serviço</option>
              {servicosAtivos.map((servico) => (
                <option key={servico.id} value={servico.id}>
                  {servico.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">Data</label>
              <input
                type="date"
                className="input"
                value={agendamentoForm.data}
                onChange={(event) => updateAgendamentoField('data', event.target.value)}
              />
            </div>
            <div>
              <label className="label">Hora início</label>
              <input
                type="time"
                className="input"
                value={agendamentoForm.hora_inicio}
                onChange={(event) => updateAgendamentoField('hora_inicio', event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">Status</label>
              <select
                className="input"
                value={agendamentoForm.status}
                onChange={(event) => updateAgendamentoField('status', event.target.value)}
              >
                {Object.keys(STATUS_LABELS).map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Término estimado</label>
              <div className="input flex items-center text-white/70">
                {horarioFim || '—'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input
              id="usar_endereco"
              type="checkbox"
              className="h-4 w-4"
              checked={agendamentoForm.usar_endereco_cliente}
              onChange={(event) => updateAgendamentoField('usar_endereco_cliente', event.target.checked)}
            />
            <label htmlFor="usar_endereco" className="text-sm text-white/70">
              Usar endereço da cliente (se existir)
            </label>
          </div>
          <div>
            <label className="label">Endereço do atendimento</label>
            <input
              className="input"
              value={agendamentoForm.endereco_atendimento}
              onChange={(event) => updateAgendamentoField('endereco_atendimento', event.target.value)}
              placeholder="Local do atendimento"
            />
          </div>
          <div>
            <label className="label">Observações</label>
            <textarea
              className="input min-h-[90px]"
              value={agendamentoForm.observacoes}
              onChange={(event) => updateAgendamentoField('observacoes', event.target.value)}
              placeholder="Detalhes adicionais"
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}



