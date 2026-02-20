import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const API_BASE = (typeof window !== 'undefined' && window.__API_BASE__) || (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE) || ''
function getApiBase(){ return (typeof window!=='undefined' && window.__ACTIVE_API_BASE__) || API_BASE }
async function apiDetect(){ 
  const cands = []
  // Prefer relative proxy in dev to avoid mixed content and cross-origin
  cands.push('/api')
  if (typeof window!=='undefined' && window.__API_BASE__) cands.push(window.__API_BASE__)
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE) cands.push(import.meta.env.VITE_API_BASE)
  cands.push('http://127.0.0.1:8000','http://localhost:8000')
  for (const base of cands){
    try{
      const ctl = new AbortController(); const to = setTimeout(()=>ctl.abort(), 1200)
      const r = await fetch(`${base}/`, { signal: ctl.signal })
      clearTimeout(to)
      if (r.ok){ if (typeof window!=='undefined') window.__ACTIVE_API_BASE__ = base; return base }
    }catch{}
  }
  return getApiBase()
}
function apiFetch(path, opts){
  // In dev, always use Vite proxy to avoid CORS and mixed content
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV) {
    return fetch(`/api${path}`, opts)
  }
  const base = getApiBase()
  if (base && /^https?:\/\//.test(base)) return fetch(`${base}${path}`, opts)
  return fetch(`${path}`, opts)
}

function UploadZone({ onUploaded, notify }) {
  const [drag, setDrag] = useState(false)
  const inputRef = useRef(null)
  const [sheetPick, setSheetPick] = useState({ open:false, sheets:[], file:null, selected:new Set() })
  const onChange = async (e) => {
    const files = Array.from(e.target.files || [])
    for (const f of files) { // sequential to allow sheet selection
      // eslint-disable-next-line no-await-in-loop
      await handleFile(f)
    }
  }
  const handleFile = async (file) => {
    const ext = file.name.toLowerCase()
    if (!(/\.(csv|xlsx|xls)$/i).test(ext)) return
    let sheets = []
    if ((/\.(xlsx|xls)$/i).test(ext)) {
      const form = new FormData()
      form.append('file', file)
      form.append('action', 'list_sheets')
      try {
        const r = await apiFetch('/upload', { method: 'POST', body: form })
        if (r.ok) {
          const j = await r.json()
          sheets = j.sheets || []
        }
      } catch {}
    }
    if (sheets.length > 1) {
      setSheetPick({ open:true, sheets, file, selected: new Set(sheets) })
      return
    }
    let form = new FormData()
    form.append('file', file)
    form.append('action', 'read')
    try{
      const res = await apiFetch('/upload', { method: 'POST', body: form })
      if (!res.ok) {
        let reason = ''
        try { reason = (await res.text())?.slice(0,140) } catch {}
        throw new Error(`HTTP ${res.status}${reason ? `: ${reason}` : ''}`)
      }
      const data = await res.json()
      const selectedSheets = (/\.(xlsx|xls)$/i).test(ext) && sheets.length === 1 ? [sheets[0]] : []
      onUploaded({ file, meta: { name: file.name, sheets, selectedSheets }, payload: data })
    }catch(err){
      const msg = (err && err.message) ? err.message : 'Upload failed'
      notify && notify(`Upload failed: ${msg}`, 'error')
    }
  }
  const onDrop = async (e) => {
    e.preventDefault()
    setDrag(false)
    const files = Array.from(e.dataTransfer.files || [])
    for (const f of files) {
      // eslint-disable-next-line no-await-in-loop
      await handleFile(f)
    }
  }
  return (
    <>
      <div className={['upload', drag ? 'drag' : ''].join(' ')}
        onDragOver={(e)=>{e.preventDefault(); setDrag(true)}}
        onDragLeave={()=>setDrag(false)}
        onDrop={onDrop}
        onClick={()=>inputRef.current?.click()}
      >
        <input ref={inputRef} style={{display:'none'}} type="file" accept=".csv,.xlsx,.xls" multiple onChange={onChange}/>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M7 18a4 4 0 010-8c.2 0 .39.01.58.04A5 5 0 1118 10h1a3 3 0 010 6H7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M12 13v6m0 0l-3-3m3 3l3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div style={{color:'#0f172a'}}>Drag & Drop CSV/Excel here, or click to browse (multi‑select supported)</div>
          <button type="button" className="btn" onClick={(e)=>{ e.stopPropagation(); inputRef.current?.click() }}>Browse files</button>
        </div>
      </div>
      {sheetPick.open && (
        <div className="sheet-picker">
          <div className="sheet-header">Select sheets from {sheetPick.file?.name}</div>
          <div className="sheet-list">
            {sheetPick.sheets.map(s=>(
              <label key={s} className="sheet-item">
                <input
                  type="checkbox"
                  checked={sheetPick.selected.has(s)}
                  onChange={(e)=>{
                    setSheetPick(prev=>{
                      const sel = new Set(prev.selected)
                      if (e.target.checked) sel.add(s); else sel.delete(s)
                      return { ...prev, selected: sel }
                    })
                  }}
                />
                <span>{s}</span>
              </label>
            ))}
          </div>
          <div className="row" style={{marginTop:8}}>
            <button className="btn" onClick={async ()=>{
              const chosen = Array.from(sheetPick.selected)
              const form = new FormData()
              form.append('file', sheetPick.file)
              form.append('action','read')
              if (chosen.length) form.append('sheets', chosen.join(','))
          const r = await apiFetch('/upload', { method:'POST', body: form })
              const data = await r.json()
              onUploaded({ file: sheetPick.file, meta: { name: sheetPick.file.name, sheets: sheetPick.sheets, selectedSheets: chosen }, payload: data })
              setSheetPick({ open:false, sheets:[], file:null, selected:new Set() })
            }}>Load Selected</button>
            <button className="btn secondary" onClick={async ()=>{
              const form = new FormData()
              form.append('file', sheetPick.file)
              form.append('action','read')
              form.append('merge_identical','true')
          const r = await apiFetch('/upload', { method:'POST', body: form })
              const data = await r.json()
              // Auto-merge implies all selected from Upload; reflect all sheets here
              onUploaded({ file: sheetPick.file, meta: { name: sheetPick.file.name, sheets: sheetPick.sheets, selectedSheets: [...sheetPick.sheets] }, payload: data })
              setSheetPick({ open:false, sheets:[], file:null, selected:new Set() })
            }}>Auto‑merge Identical</button>
            <button className="btn secondary" onClick={()=> setSheetPick({ open:false, sheets:[], file:null, selected:new Set() })}>Cancel</button>
          </div>
        </div>
      )}
    </>
  )
}

function RecommendationBar({ recs, onAddStep }) {
  if (!recs || (Array.isArray(recs) && recs.length===0)) {
    return <div className="panel"><h3>Suggested Next Steps</h3><div className="chips"><span className="chip">No suggestions yet</span></div></div>
  }
  const items = Array.isArray(recs) ? recs : Object.values(recs).flat()
  const mapping = {
    'Standardize Date': { type: 'standardizeDate', config: { col: 'Date' } },
    'Sort by Date': { type: 'sortByDate', config: { col: 'Date', order: 'asc' } },
    'Financial P&L operations': { type: 'calculateNetProfit', config: {} },
    'Pattern Validation': { type: 'validateRegex', config: { column: '', pattern: '', mark_col: '' } },
    'Monthly P&L': { type: 'aggregatePLByPeriod', config: { date_col: 'Date', freq: 'M', revenue_col: 'Revenue', cogs_col: 'COGS', expenses_col: 'Expenses' } },
    'Convert Currency to Number': { type: 'currencyToFloat', config: { columns: [] } },
    'Detect Outliers': { type: 'detectOutliers', config: { columns: [], k: 1.5 } },
    'Remove Duplicates': { type: 'dropDuplicates', config: { subset: [], keep: 'first' } },
    'Add Net Sales Column': { type: 'addColumnFormula', config: { dest: 'Net Sales', expr: '`Revenue` - `Discount`' } },
  }
  const desc = {
    'Standardize Date': 'Make all values in a chosen date column consistent (YYYY-MM-DD) so filters and sorting behave reliably.',
    'Sort by Date': 'Sort the table by a selected date column. Choose ascending or descending.',
    'Financial P&L operations': 'Create a “Net Profit” column using Revenue, COGS and, if present, Expenses.',
    'Pattern Validation': 'Check values in an ID or account column against a pattern and flag invalid entries.',
    'Monthly P&L': 'Aggregate Revenue, COGS, Expenses by month and compute Gross/Net Profit.',
    'Convert Currency to Number': 'Turn text currency fields (₹1,200, ($300)) into numeric columns.',
    'Detect Outliers': 'Flag unusually high/low values in price or quantity using IQR.',
    'Remove Duplicates': 'Drop duplicate rows based on one or more key columns.',
    'Add Net Sales Column': 'Add Net Sales = Revenue - Discount as a new metric column.',
  }
  return (
    <div className="panel">
      <h3>Suggested Next Steps</h3>
      <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:8}}>
        {items.map((t, i)=>(
          <div key={i} className="step" style={{flexDirection:'column', alignItems:'flex-start', gap:8}}>
            <div style={{fontWeight:700, fontSize:12}}>{t}</div>
            <div style={{fontSize:12, color:'var(--muted)'}}>{desc[t] || t}</div>
            <div><button className="btn" onClick={()=>mapping[t] && onAddStep(mapping[t])}>Add to Pipeline</button></div>
          </div>
        ))}
      </div>
    </div>
  )
}

function DataInsights({ file, profile, onApplySuggestion, showSuggestions=true }) {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState(profile)
  useEffect(()=>{
    const run = async () => {
      if (!file) return
      setLoading(true)
      const form = new FormData()
      form.append('file', file)
      const r = await apiFetch('/profile', { method:'POST', body: form })
      const j = await r.json()
      setData(j)
      setLoading(false)
    }
    run()
  }, [file])
  if (!file) return null
  const items = data?.profile || []
  return (
    <div className="panel">
      <h3>Data Insights {loading ? '(loading...)' : ''}</h3>
      {showSuggestions && (
        <div className="chips" style={{marginBottom:8}}>
          {(data?.suggestions || []).map((s,i)=>(
            <button key={i} className="chip primary" onClick={()=>onApplySuggestion(s)}>{s}</button>
          ))}
          {(data?.proposed_recipe || []).length ? <button className="chip primary" onClick={()=>{
            onApplySuggestion({ applyAll: true, steps: (data?.proposed_recipe||[]).map(p=>({ type:p.type, config:p.config||{} })) })
          }}>Apply All</button> : null}
        </div>
      )}
      <div style={{display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:8, maxHeight:260, overflow:'auto'}}>
        {items.map((p,i)=>(
          <div key={i} style={{border:'1px solid var(--border)', borderRadius:10, padding:8}}>
            <div style={{fontWeight:700, fontSize:12}}>{p.column}</div>
            <div style={{fontSize:11, color:'var(--muted)'}}>type: {p.dtype}, nulls: {p.nulls}, uniques: {p.uniques}</div>
            <div style={{fontSize:11, marginTop:4}}>
              {p.top?.map((t,idx)=> <span key={idx} style={{marginRight:8}}>{t.value} ({t.count})</span>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function JoinAssistant({ mainFile, joinFile, mainSheets, joinSheets, onSetMainSheets, onSetJoinFile, onSetJoinSheets, onOpenJoinSheets, onSimulatePreview, onAddJoinStep }) {
  const [b, setB] = useState(joinFile||null)
  const [res, setRes] = useState(null)
  const [selectedKey, setSelectedKey] = useState('')
  const [how, setHow] = useState('left')
  const [sample, setSample] = useState(5)
  const [sheetsA, setSheetsA] = useState(mainSheets||[])
  const [sheetsB, setSheetsB] = useState(joinSheets||[])
  const [availA, setAvailA] = useState([])
  const [availB, setAvailB] = useState([])
  useEffect(()=>{ setB(joinFile||null) }, [joinFile])
  // Keep available options in sync with what was selected on Upload; fallback to listing if none selected
  const listSheets = async (file, setAvail) => {
    if (!file || !/\.(xlsx|xls)$/i.test(file?.name||'')) { setAvail([]); return }
    const form = new FormData()
    form.append('file', file)
    form.append('action','list_sheets')
    try{
      const r = await apiFetch('/upload', { method:'POST', body: form })
      const j = await r.json()
      setAvail(j.sheets||[])
    }catch{ setAvail([]) }
  }
  useEffect(()=>{
    if (mainSheets && mainSheets.length) {
      setAvailA(mainSheets)
      // if no selected sheet yet, default to the first available
      setSheetsA(prev => (prev && prev.length) ? prev : [mainSheets[0]])
    } else {
      listSheets(mainFile, setAvailA)
    }
  }, [mainFile, JSON.stringify(mainSheets||[])])
  useEffect(()=>{
    if (joinSheets && joinSheets.length) {
      setAvailB(joinSheets)
      setSheetsB(prev => (prev && prev.length) ? prev : [joinSheets[0]])
    } else {
      listSheets(b, setAvailB)
    }
  }, [b, JSON.stringify(joinSheets||[])])
  const run = async () => {
    if (!mainFile || !b) return
    const form = new FormData()
    form.append('file_a', mainFile)
    form.append('file_b', b)
    if ((sheetsA||[]).length) form.append('sheets_a', sheetsA.join(','))
    if ((sheetsB||[]).length) form.append('sheets_b', sheetsB.join(','))
    const r = await apiFetch('/join-suggest', { method: 'POST', body: form })
    const j = await r.json()
    setRes(j)
    setSelectedKey(j.candidates?.[0]?.column || '')
  }
  const simulate = async () => {
    if (!mainFile || !b || !selectedKey) return
    if (onSimulatePreview) onSimulatePreview(selectedKey, how, sample)
  }
  return (
    <div className="panel">
      <h3>Join Assistant</h3>
      <div className="row">
        <div className="chip">Main: {mainFile?.name || '—'}</div>
        <div className="chip">Join: {b?.name || '—'}</div>
        <button className="btn" title="Scan both datasets and propose a column to join on" onClick={run}>Scan & Suggest Key</button>
      </div>
      {(availA.length>0 || availB.length>0) && (
        <div className="row" style={{marginTop:8}}>
          {availA.length>0 && (
            <select className="grow" value={(sheetsA&&sheetsA[0])||''} onChange={e=>{ const v=e.target.value; setSheetsA(v?[v]:[]); onSetMainSheets && onSetMainSheets(v?[v]:[]) }} title="Sheet for Main file">
              <option value="">All selected from Upload</option>
              {availA.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          )}
          {availB.length>0 && (
            <select className="grow" value={(sheetsB&&sheetsB[0])||''} onChange={e=>{ const v=e.target.value; setSheetsB(v?[v]:[]); onSetJoinSheets && onSetJoinSheets(v?[v]:[]) }} title="Sheet for Join file">
              <option value="">All selected from Upload</option>
              {availB.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          )}
        </div>
      )}
      <div className="row" style={{marginTop:8}}>
        <select className="grow" value={selectedKey} onChange={e=>setSelectedKey(e.target.value)} disabled={!res || !(res.candidates||[]).length}>
          <option value="">{res ? 'Select join key' : 'Run “Scan & Suggest Keys” first'}</option>
          {(res?.candidates||[]).map((c,i)=><option key={i} value={c.column}>{c.column} (score {c.score})</option>)}
        </select>
        <select value={how} onChange={e=>setHow(e.target.value)}>
          <option value="left">left</option>
          <option value="inner">inner</option>
          <option value="right">right</option>
        </select>
        <input type="number" min="1" style={{width:120}} value={sample} onChange={e=>setSample(parseInt(e.target.value||'5',10))} placeholder="Rows to preview" title="Number of rows to preview in join simulation"/>
        <button className="btn" onClick={simulate} disabled={!selectedKey || !b || !mainFile}>Simulate Join</button>
        <button className="btn secondary" onClick={()=> onAddJoinStep && selectedKey && onAddJoinStep(selectedKey, how)} disabled={!selectedKey}>Add Join Step</button>
      </div>
      {res && <div style={{marginTop:8}}>
        <div style={{fontSize:12, color:'var(--muted)', marginBottom:6}}>Suggested keys (higher score = better match)</div>
        <div style={{maxHeight:180, overflow:'auto'}}>
        {(res.candidates||[]).slice(0,10).map((c,i)=>(
          <div key={i} className="step">
            <div style={{fontSize:12}}>{c.column}</div>
            <div style={{fontSize:11, color:'var(--muted)'}}>score {c.score} | overlap {c.overlap} | leftOnly {c.left_only} | rightOnly {c.right_only}</div>
          </div>
        ))}
        </div>
      </div>}
    </div>
  )
}
function TemplatePicker({ onApply }) {
  const [list, setList] = useState([])
  const [selected, setSelected] = useState('')
  const refresh = async () => {
    const r = await apiFetch('/templates')
    const j = await r.json()
    setList(j.templates || [])
    if (!selected && j.templates?.length) setSelected(j.templates[0])
  }
  useEffect(()=>{ refresh() },[])
  const load = async () => {
    if (!selected) return
    const r = await apiFetch(`/templates/${encodeURIComponent(selected)}`)
    const j = await r.json()
    onApply(j.recipe || [])
  }
  const renameTpl = async () => {
    const name = prompt('New name', selected)
    if (!name) return
    await apiFetch('/templates/rename', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ old: selected, new: name })})
    await refresh()
    setSelected(name)
  }
  const deleteTpl = async () => {
    if (!selected) return
    if (!confirm(`Delete template "${selected}"?`)) return
    await apiFetch('/templates/delete', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name: selected })})
    await refresh()
    setSelected('')
  }
  return (
    <div className="panel">
      <h3>Templates</h3>
      <div className="row">
        <select className="grow" value={selected} onChange={e=>setSelected(e.target.value)}>
          <option value="">Select template</option>
          {list.map(n=><option key={n} value={n}>{n}</option>)}
        </select>
        <button className="btn" onClick={load}>Apply</button>
      </div>
      <div className="row" style={{marginTop:8}}>
        <button className="btn secondary" onClick={renameTpl}>Rename</button>
        <button className="btn secondary" onClick={deleteTpl}>Delete</button>
      </div>
    </div>
  )
}

function RecipeSidebar({ steps, onAdd, onRemove, onChange, columns }) {
  const [type, setType] = useState('filterDateRange')
  const add = () => {
    const base = { id: `${Date.now()}`, type, config: {} }
    if (type === 'filterDateRange') base.config = { from: '', to: '', col: 'Date' }
    if (type === 'mergeColumns') base.config = { cols: [], dest: 'Merged' }
    if (type === 'calculateNetProfit') base.config = {}
    if (type === 'standardizeDate') base.config = { col: 'Date' }
    if (type === 'sortByDate') base.config = { col: 'Date', order: 'asc' }
    if (type === 'filterDebitCredit') base.config = { col: 'Type', include: ['Debit'] }
    if (type === 'detectOutliers') base.config = { columns: [], k: 1.5 }
    if (type === 'validateRegex') base.config = { column: '', pattern: '', mark_col: '' }
    if (type === 'replaceValues') base.config = { columns: [], to: '', value: '', regex: false, case: true }
    if (type === 'dropDuplicates') base.config = { subset: [], keep: 'first' }
    if (type === 'trimWhitespace') base.config = { columns: [] }
    if (type === 'lowercaseText') base.config = { columns: [] }
    if (type === 'addColumnFormula') base.config = { dest: 'Result', expr: '' }
    if (type === 'filterExpr') base.config = { expr: '' }
    if (type === 'groupByAggregate') base.config = { by: [], aggs: {} }
    onAdd(base)
  }
  return (
    <div className="panel sidebar">
      <h3>Transformation Recipe</h3>
      <div className="row">
        <select value={type} className="grow" onChange={e=>setType(e.target.value)}>
          <option value="filterDateRange">Filter Date Range</option>
          <option value="mergeColumns">Merge Columns</option>
          <option value="calculateNetProfit">Calculate Net Profit</option>
          <option value="standardizeDate">Standardize Date</option>
          <option value="sortByDate">Sort by Date</option>
          <option value="filterDebitCredit">Filter Debit/Credit</option>
          <option value="detectOutliers">Detect Outliers (IQR)</option>
          <option value="validateRegex">Validate Regex</option>
          <option value="replaceValues">Replace Values</option>
          <option value="dropDuplicates">Remove Duplicates</option>
          <option value="trimWhitespace">Trim Whitespace</option>
          <option value="lowercaseText">Lowercase Text</option>
          <option value="addColumnFormula">Add Column (Formula)</option>
          <option value="filterExpr">Filter by Expression</option>
          <option value="groupByAggregate">Group & Aggregate</option>
        </select>
        <button className="btn" onClick={add}>Add</button>
      </div>
      <div style={{display:'flex', flexDirection:'column', gap:8, marginTop:8}}>
        {steps.map(s=>(
          <div key={s.id} className="step">
            <div style={{fontSize:12, fontWeight:700}}>{s.type}</div>
            <div className="row" style={{gap:8, flexWrap:'wrap'}}>
              {s.type === 'filterDateRange' && (
                <>
                  <select value={s.config.col||'Date'} onChange={e=>onChange(s.id,{col:e.target.value})} title="Date column">
                    {columns.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                  <input type="date" value={s.config.from||''} onChange={e=>onChange(s.id,{from:e.target.value})} placeholder="From date"/>
                  <input type="date" value={s.config.to||''} onChange={e=>onChange(s.id,{to:e.target.value})} placeholder="To date"/>
                </>
              )}
              {s.type === 'mergeColumns' && (
                <>
                  <select multiple value={s.config.cols||[]} onChange={e=>onChange(s.id,{cols:[...e.target.selectedOptions].map(o=>o.value)})} title="Columns to merge">
                    {columns.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                  <input placeholder="Destination column name" value={s.config.dest||'Merged'} onChange={e=>onChange(s.id,{dest:e.target.value})}/>
                  <input placeholder="Separator e.g. space" value={s.config.sep||' '} onChange={e=>onChange(s.id,{sep:e.target.value})}/>
                </>
              )}
              {s.type === 'standardizeDate' && (
                <select value={s.config.col||'Date'} onChange={e=>onChange(s.id,{col:e.target.value})} title="Date column">
                  {columns.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              )}
              {s.type === 'sortByDate' && (
                <>
                  <select value={s.config.col||'Date'} onChange={e=>onChange(s.id,{col:e.target.value})} title="Date column">
                    {columns.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                  <select value={s.config.order||'asc'} onChange={e=>onChange(s.id,{order:e.target.value})}>
                    <option value="asc">asc</option>
                    <option value="desc">desc</option>
                  </select>
                </>
              )}
              {s.type === 'filterDebitCredit' && (
                <>
                  <select value={s.config.col||'Type'} onChange={e=>onChange(s.id,{col:e.target.value})} title="Type column">
                    {columns.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                  <input placeholder="Include values (comma-separated)" value={(s.config.include||[]).join(',')} onChange={e=>onChange(s.id,{include:e.target.value.split(',').map(x=>x.trim()).filter(Boolean)})}/>
                </>
              )}
              {s.type === 'detectOutliers' && (
                <>
                  <select multiple value={s.config.columns||[]} onChange={e=>onChange(s.id,{columns:[...e.target.selectedOptions].map(o=>o.value)})} title="Numeric columns">
                    {columns.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                  <input type="number" step="0.1" style={{width:120}} value={s.config.k||1.5} onChange={e=>onChange(s.id,{k:parseFloat(e.target.value||'1.5')})} placeholder="IQR multiplier (k)"/>
                </>
              )}
              {s.type === 'validateRegex' && (
                <>
                  <select value={s.config.column||''} onChange={e=>onChange(s.id,{column:e.target.value})}>
                    <option value="">column</option>
                    {columns.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                  <input placeholder="Regex pattern" value={s.config.pattern||''} onChange={e=>onChange(s.id,{pattern:e.target.value})}/>
                  <input placeholder="Output flag column (optional)" value={s.config.mark_col||''} onChange={e=>onChange(s.id,{mark_col:e.target.value})}/>
                </>
              )}
              {s.type === 'replaceValues' && (
                <>
                  <select multiple value={s.config.columns||[]} onChange={e=>onChange(s.id,{columns:[...e.target.selectedOptions].map(o=>o.value)})} title="Columns to update">
                    {columns.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                  <input placeholder="Find value (or pattern)" value={s.config.to||''} onChange={e=>onChange(s.id,{to:e.target.value})}/>
                  <input placeholder="Replacement value" value={s.config.value||''} onChange={e=>onChange(s.id,{value:e.target.value})}/>
                  <label><input type="checkbox" checked={!!s.config.regex} onChange={e=>onChange(s.id,{regex:e.target.checked})}/> regex</label>
                  <label><input type="checkbox" checked={s.config.case!==false} onChange={e=>onChange(s.id,{case:e.target.checked})}/> case-sensitive</label>
                </>
              )}
              {s.type === 'dropDuplicates' && (
                <>
                  <select multiple value={s.config.subset||[]} onChange={e=>onChange(s.id,{subset:[...e.target.selectedOptions].map(o=>o.value)})}>
                    {columns.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                  <select value={s.config.keep||'first'} onChange={e=>onChange(s.id,{keep:e.target.value})}>
                    <option value="first">first</option>
                    <option value="last">last</option>
                    <option value="False">drop all</option>
                  </select>
                </>
              )}
              {s.type === 'trimWhitespace' && (
                <select multiple value={s.config.columns||[]} onChange={e=>onChange(s.id,{columns:[...e.target.selectedOptions].map(o=>o.value)})} title="Text columns">
                  {columns.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              )}
              {s.type === 'lowercaseText' && (
                <select multiple value={s.config.columns||[]} onChange={e=>onChange(s.id,{columns:[...e.target.selectedOptions].map(o=>o.value)})} title="Text columns">
                  {columns.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              )}
              {s.type === 'addColumnFormula' && (
                <>
                  <input placeholder="New column name" value={s.config.dest||'Result'} onChange={e=>onChange(s.id,{dest:e.target.value})}/>
                  <input placeholder="Formula e.g. (`Revenue`-`COGS`)/`Revenue`*100" value={s.config.expr||''} onChange={e=>onChange(s.id,{expr:e.target.value})} className="grow"/>
                </>
              )}
              {s.type === 'filterExpr' && (
                <input placeholder="Filter expression e.g. `Revenue` > 1000 and `Type`=='Debit'" value={s.config.expr||''} onChange={e=>onChange(s.id,{expr:e.target.value})} className="grow"/>
              )}
              {s.type === 'groupByAggregate' && (
                <>
                  <select multiple value={s.config.by||[]} onChange={e=>onChange(s.id,{by:[...e.target.selectedOptions].map(o=>o.value)})}>
                    {columns.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                  <input placeholder='Aggregations JSON e.g. {"Revenue":["sum","max"]}' value={JSON.stringify(s.config.aggs||{})} onChange={e=>{try{onChange(s.id,{aggs: JSON.parse(e.target.value||'{}')})}catch{}}} className="grow"/>
                </>
              )}
              <button className="btn secondary" onClick={()=>onRemove(s.id)}>Remove</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function LivePreview({ columns, rows, loading, hasFile }) {
  if (!rows || rows.length === 0) return (
    <div className="panel"><h3>Live Preview {loading ? '(loading...)' : ''}</h3><div className="preview" style={{padding:16}}>{loading ? 'Loading preview…' : (hasFile ? 'No rows after filter (adjust conditions)' : 'Upload a file in Upload & Tools or click "Use as Main" in Join Assistant')}</div></div>
  )
  const cols = columns && columns.length ? columns : Object.keys(rows[0] || {})
  return (
    <div className="panel">
      <h3>Live Preview {loading ? '(loading...)' : ''}</h3>
      <div className="preview" style={{ overflowX: 'auto' }}>
        <table style={{ minWidth: 'max-content' }}>
          <thead><tr>{cols.map(c=><th key={c}>{c}</th>)}</tr></thead>
          <tbody>
            {rows.slice(0,10).map((r, i)=>(
              <tr key={i}>{cols.map(c=><td key={c}>{String(r[c] ?? '')}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function applyRecipe(sample, steps) {
  let out = [...sample]
  const num = (v)=> {
    if (v===null||v===undefined) return NaN
    const s = String(v).trim()
    const neg = s.startsWith('(')&&s.endsWith(')')
    const clean = s.replace(/[^0-9.\-]/g,'')
    const val = clean ? parseFloat(clean) : NaN
    return neg ? -val : val
  }
  const byCol = (o, col)=> String(o?.[col] ?? '')
  for (const s of steps) {
    if (s.type === 'filterDateRange') {
      const col = s.config.col || 'Date'
      const from = s.config.from ? new Date(s.config.from) : null
      const to = s.config.to ? new Date(s.config.to) : null
      out = out.filter(r=>{
        const d = new Date(byCol(r, col))
        if (isNaN(d.getTime())) return false
        if (from && d < from) return false
        if (to && d > to) return false
        return true
      })
    }
    if (s.type === 'mergeColumns') {
      const { cols = [], dest = 'Merged', sep = ' ' } = s.config || {}
      out = out.map(r=>{
        const v = cols.map(c=>String(r[c] ?? '')).filter(x=>x && x !== 'null' && x !== 'undefined').join(sep).trim()
        return { ...r, [dest]: v || null }
      })
    }
    if (s.type === 'calculateNetProfit') {
      out = out.map(r=>{
        const rev = num(r['Revenue'])
        const cogs = num(r['COGS'])
        const exp = 'Expenses' in r ? num(r['Expenses']) : NaN
        const np = isNaN(exp) ? (rev - cogs) : (rev - cogs - exp)
        return { ...r, ['Net Profit']: isFinite(np) ? np : null }
      })
    }
    if (s.type === 'standardizeDate') {
      const col = s.config?.col || 'Date'
      out = out.map(r=>{
        const d = new Date(byCol(r, col))
        const val = isNaN(d.getTime()) ? null : d.toISOString().slice(0,10)
        return { ...r, [col]: val }
      })
    }
    if (s.type === 'sortByDate') {
      const col = s.config?.col || 'Date'
      const dir = s.config?.order === 'desc' ? -1 : 1
      out = [...out].sort((a,b)=>{
        const da = new Date(byCol(a,col)).getTime()
        const db = new Date(byCol(b,col)).getTime()
        return (da - db) * dir
      })
    }
    if (s.type === 'filterDebitCredit') {
      const col = s.config?.col || 'Type'
      const include = new Set((s.config?.include || []).map(x=>String(x).toLowerCase()))
      out = out.filter(r=> include.has(String(r[col] ?? '').toLowerCase()))
    }
  }
  return out
}

export default function App(){
  const [page, setPage] = useState('upload') // upload | join | transform
  const [fileMeta, setFileMeta] = useState(null)
  const [lastFile, setLastFile] = useState(null)
  const [filesList, setFilesList] = useState([]) // [{name,file,isMain}]
  const [sheetDlg, setSheetDlg] = useState({ open:false, sheets:[], selected:new Set(), index:-1, file:null })
  const [columns, setColumns] = useState([])
  const [sample, setSample] = useState([])
  const [recs, setRecs] = useState([])
  const [steps, setSteps] = useState([])
  const [previewTempSteps, setPreviewTempSteps] = useState(null) // used for simulate join preview without committing step
  const [previewRows, setPreviewRows] = useState([])
  const [previewCols, setPreviewCols] = useState([])
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewLimit, setPreviewLimit] = useState(10)
  const [joinAuxFile, setJoinAuxFile] = useState(null)
  const [toolsTab, setToolsTab] = useState('suggest')
  const [templateName, setTemplateName] = useState('')
  const [saveHint, setSaveHint] = useState('')
  const [lastAddedId, setLastAddedId] = useState(null)
  const [joinMainSheets, setJoinMainSheets] = useState([])
  const [joinOtherSheets, setJoinOtherSheets] = useState([])
  const [exportFormat, setExportFormat] = useState('xlsx')
  const [toast, setToast] = useState(null) // { text, type }
  const notify = useCallback((text, type='info')=>{
    setToast({ text, type })
    window.clearTimeout(notify._t)
    notify._t = window.setTimeout(()=> setToast(null), 2600)
  },[])
  const [apiBase, setApiBase] = useState(null)
  const [apiOnline, setApiOnline] = useState(false)
  useEffect(()=>{
    let cancelled = false
    const init = async ()=>{
      const base = await apiDetect()
      if (cancelled) return
      setApiBase(base)
      const ping = async ()=>{
        try{
          const ctl = new AbortController(); const to = setTimeout(()=>ctl.abort(), 1200)
          const r = await fetch(`${base}/`)
          clearTimeout(to)
          setApiOnline(r.ok)
        }catch{ setApiOnline(false) }
      }
      ping()
      const id = setInterval(ping, 5000)
      return ()=> clearInterval(id)
    }
    const cleanupPromise = init()
    return ()=>{ cancelled = true; if (cleanupPromise && typeof cleanupPromise.then==='function'){ cleanupPromise.then(fn=>fn&&fn()) } }
  },[])
  const useFileAsMain = useCallback(async (file)=>{
    if (!file) return
    let form = new FormData()
    form.append('file', file)
    form.append('action', 'list_sheets')
    let sheets = []
    try {
      const r = await apiFetch('/upload', { method: 'POST', body: form })
      if (r.ok) {
        const j = await r.json()
        sheets = j.sheets || []
      }
    } catch {}
    form = new FormData()
    form.append('file', file)
    form.append('action', 'read')
    if (sheets.length > 1) form.append('merge_identical', 'true')
    const res = await apiFetch('/upload', { method: 'POST', body: form })
    const data = await res.json()
    setFileMeta({ name: file.name, sheets })
    setLastFile(file)
    if (data.merged || data.columns) {
      setColumns(data.columns || [])
      setSample(data.sample || [])
      setRecs(data.recommendations || [])
    } else if (data.sheets) {
      const first = Object.values(data.sheets)[0]
      setColumns(first.columns || [])
      setSample(first.sample || [])
      setRecs(data.recommendations || [])
    }
    setSteps([])
  },[])

  const handleUploaded = useCallback(({ file, meta, payload })=>{
    // Track uploaded files; make first main; if a second arrives, set as join by default
    setFilesList(prev=>{
      const next = [...prev, {
        name: meta.name,
        file,
        isMain: prev.length===0,
        sheets: Array.isArray(meta?.sheets) ? meta.sheets : [],
        selectedSheets: Array.isArray(meta?.selectedSheets) ? meta.selectedSheets : []
      }]
      if (next.find(x=>x.isMain)) {
        setLastFile(next.find(x=>x.isMain).file)
        setFileMeta(prevMeta => prevMeta || meta)
      }
      if (next.length>=2) {
        const nonMain = next.find(x=>!x.isMain)
        if (nonMain && !joinAuxFile) setJoinAuxFile(nonMain.file)
      }
      return next
    })
    // Maintain dataset/sample
    if (payload.merged || payload.columns) {
      setColumns(payload.columns || [])
      setSample(payload.sample || [])
      setRecs(payload.recommendations || [])
    } else if (payload.sheets) {
      const first = Object.values(payload.sheets)[0]
      setColumns(first.columns || [])
      setSample(first.sample || [])
      setRecs(payload.recommendations || [])
    }
    setSteps([])
  },[])

  useEffect(()=>{
    let cancelled = false
    const run = async () => {
      if (!lastFile) {
        setPreviewRows([])
        setPreviewCols(columns || [])
        return
      }
      setPreviewLoading(true)
      try {
        const form = new FormData()
        form.append('file', lastFile)
        const effectiveSteps = (previewTempSteps && previewTempSteps.length) ? previewTempSteps : (steps||[])
        form.append('recipe', JSON.stringify(effectiveSteps))
        form.append('limit', String(previewLimit||10))
        // pass selected sheets for main file if available (join override takes precedence)
        const mainEntry = filesList.find(f=>f.file===lastFile)
        const mainSheetsToUse = (joinMainSheets && joinMainSheets.length) ? joinMainSheets : (mainEntry?.selectedSheets || [])
        if (mainSheetsToUse.length) form.append('sheets', mainSheetsToUse.join(','))
        if ((effectiveSteps||[]).some(s=>s.type==='joinWithFile') && joinAuxFile) {
          form.append('join_file', joinAuxFile)
          const joinEntry = filesList.find(f=>f.file===joinAuxFile)
          const js = (joinOtherSheets && joinOtherSheets.length) ? joinOtherSheets : (joinEntry?.selectedSheets || [])
          if (js.length) form.append('join_sheets', js.join(','))
        }
        const r = await apiFetch('/preview-transform', { method:'POST', body: form })
        const j = await r.json()
        if (cancelled) return
        setPreviewRows(j.sample || [])
        setPreviewCols(j.columns || [])
        if (j.columns && j.columns.length) setColumns(j.columns)
        // Keep simulated preview until user changes it or commits
      } catch (e) {
        if (!cancelled) {
          setPreviewRows([])
          setPreviewCols(columns || [])
        }
      } finally {
        if (!cancelled) setPreviewLoading(false)
      }
    }
    run()
    return ()=>{ cancelled = true }
  }, [lastFile, JSON.stringify(steps), JSON.stringify(previewTempSteps||[]), joinAuxFile])

  useEffect(()=>{
    let cancelled = false
    const refresh = async ()=>{
      if (!lastFile) return
      try{
        const form = new FormData()
        form.append('file', lastFile)
        form.append('recipe', JSON.stringify(steps||[]))
        const mainEntry = filesList.find(f=>f.file===lastFile)
        const ms = (joinMainSheets && joinMainSheets.length) ? joinMainSheets : (mainEntry?.selectedSheets||[])
        if (ms.length) form.append('sheets', ms.join(','))
        if ((steps||[]).some(s=>s.type==='joinWithFile') && joinAuxFile){
          form.append('join_file', joinAuxFile)
          const joinEntry = filesList.find(f=>f.file===joinAuxFile)
          const js = (joinOtherSheets && joinOtherSheets.length) ? joinOtherSheets : (joinEntry?.selectedSheets||[])
          if (js.length) form.append('join_sheets', js.join(','))
        }
      const r = await apiFetch('/profile', { method:'POST', body: form })
        const j = await r.json()
        if (cancelled) return
        setRecs(j.suggestions || [])
      }catch{}
    }
    refresh()
    return ()=>{ cancelled = true }
  }, [lastFile, JSON.stringify(steps), joinAuxFile, JSON.stringify(joinMainSheets||[]), JSON.stringify(joinOtherSheets||[])])

  const addStep = s => { setSteps(prev => [...prev, s]); setLastAddedId(s.id) }
  const removeStep = id => setSteps(prev => prev.filter(x=>x.id!==id))
  const undoLast = () => { if (lastAddedId) { removeStep(lastAddedId); setLastAddedId(null) } }
  const saveTemplate = async () => {
    const name = (templateName||'').trim()
    if (!name) return
    await apiFetch('/templates/save', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ name, recipe: steps })
    })
    // optional: clear after save
    // setTemplateName('')
  }
  const simulateJoinPreview = async (key, how, sampleLimit) => {
    if (!lastFile || !joinAuxFile || !key) return
    const form = new FormData()
    form.append('file', lastFile)
    const temp = [...(steps||[]), { type:'joinWithFile', config:{ key, how } }]
    form.append('recipe', JSON.stringify(temp))
    const limitVal = parseInt(String(sampleLimit||10),10)
    form.append('limit', String(Number.isFinite(limitVal)?limitVal:10))
    const mainEntry = filesList.find(f=>f.file===lastFile)
    const ms = (joinMainSheets && joinMainSheets.length) ? joinMainSheets : (mainEntry?.selectedSheets||[])
    if (ms.length) form.append('sheets', ms.join(','))
    form.append('join_file', joinAuxFile)
    const joinEntry = filesList.find(f=>f.file===joinAuxFile)
    const js = (joinOtherSheets && joinOtherSheets.length) ? joinOtherSheets : (joinEntry?.selectedSheets||[])
    if (js.length) form.append('join_sheets', js.join(','))
        const r = await apiFetch('/preview-transform', { method:'POST', body: form })
    const j = await r.json()
    setPreviewRows(j.sample || [])
    setPreviewCols(j.columns || [])
  }
  const exportExcel = async () => {
    if (!lastFile) { notify('Upload a file first', 'warn'); return }
    const form = new FormData()
    form.append('file', lastFile)
    form.append('recipe', JSON.stringify(steps))
    form.append('format', exportFormat)
    const guessCol = columns.includes('Net Profit') ? 'Net Profit' : (columns.includes('Revenue') ? 'Revenue' : '')
    if (guessCol) form.append('value_column', guessCol)
    if ((steps||[]).some(s=>s.type==='joinWithFile') && joinAuxFile) {
      form.append('join_file', joinAuxFile)
      const joinEntry = filesList.find(f=>f.file===joinAuxFile)
      const js = (joinOtherSheets && joinOtherSheets.length) ? joinOtherSheets : (joinEntry?.selectedSheets||[])
      if (js.length) form.append('join_sheets', js.join(','))
    }
    const mainEntry = filesList.find(f=>f.file===lastFile)
    const ms = (joinMainSheets && joinMainSheets.length) ? joinMainSheets : (mainEntry?.selectedSheets||[])
    if (ms.length) form.append('sheets', ms.join(','))
    const res = await apiFetch('/export', { method: 'POST', body: form })
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = exportFormat==='csv' ? 'midas_output.csv' : (exportFormat==='json' ? 'midas_output.json' : 'midas_output.xlsx')
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const openSheetsFor = async (idx) => {
    const entry = filesList[idx]
    if (!entry) return
    const form = new FormData()
    form.append('file', entry.file)
    form.append('action','list_sheets')
    let sheets = []
    try {
      const r = await apiFetch('/upload', { method:'POST', body: form })
      const j = await r.json()
      sheets = j.sheets || []
    } catch {}
    if (sheets.length<=1) return
    const preSelected = new Set(entry.selectedSheets && entry.selectedSheets.length ? entry.selectedSheets : sheets)
    setSheetDlg({ open:true, sheets, selected: preSelected, index: idx, file: entry.file })
  }

  const applySheetSelection = async () => {
    const idx = sheetDlg.index
    if (idx<0) return
    const entry = filesList[idx]
    const chosen = Array.from(sheetDlg.selected)
    const form = new FormData()
    form.append('file', entry.file)
    form.append('action','read')
    if (chosen.length) form.append('sheets', chosen.join(','))
    const r = await apiFetch('/upload', { method:'POST', body: form })
    const data = await r.json()
    setFilesList(prev=>{
      const next = [...prev]
      next[idx] = { ...next[idx], selectedSheets: chosen }
      return next
    })
    if (entry.isMain) {
      if (data.merged || data.columns) {
        setColumns(data.columns || [])
        setSample(data.sample || [])
        setRecs(data.recommendations || [])
      } else if (data.sheets) {
        const first = Object.values(data.sheets)[0]
        setColumns(first.columns || [])
        setSample(first.sample || [])
        setRecs(data.recommendations || [])
      }
    }
    setSheetDlg({ open:false, sheets:[], selected:new Set(), index:-1, file:null })
  }

  return (
    <div className="container">
      <div className="header">
        <div className="brand">
          <div className="logo">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <defs>
                <linearGradient id="g1" x1="0" y1="0" x2="24" y2="24">
                  <stop offset="0%" stopColor="#fff" stopOpacity="0.85"/>
                  <stop offset="100%" stopColor="#fff" stopOpacity="0.65"/>
                </linearGradient>
              </defs>
              <path d="M4 17l5.5-10 3 6L20 7" stroke="url(#g1)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="20" cy="7" r="2" fill="#fff"/>
            </svg>
          </div>
          <div className="title">Midas Dashboard</div>
        </div>
        <div className="row">
          <button className={`chip ${page==='upload'?'primary':''}`} onClick={()=>setPage('upload')}>Upload</button>
          <button className={`chip ${page==='join'?'primary':''}`} onClick={()=>setPage('join')}>Join</button>
          <button className={`chip ${page==='transform'?'primary':''}`} onClick={()=>setPage('transform')}>Transform</button>
        </div>
        <div className="btns">
          <input
            style={{minWidth:220}}
            placeholder="Template name"
            value={templateName}
            onChange={e=>setTemplateName(e.target.value)}
            onKeyDown={(e)=>{ if (e.key==='Enter' && templateName.trim()) { saveTemplate().then(()=>{ setSaveHint('Saved'); setTimeout(()=>setSaveHint(''), 2000) }) } }}
            title="Type a name and press Enter to save"
          />
          <button className="btn mint" onClick={()=>{setSteps([])}}>Clear Recipe</button>
          <button className="btn" onClick={async ()=>{ await saveTemplate(); setSaveHint('Saved'); setTimeout(()=>setSaveHint(''), 2000) }} disabled={!templateName.trim()}>Save Template</button>
          <select value={exportFormat} onChange={e=>setExportFormat(e.target.value)} title="Export format">
            <option value="xlsx">Excel (.xlsx)</option>
            <option value="csv">CSV (.csv)</option>
            <option value="json">JSON (.json)</option>
          </select>
          <button className="btn" onClick={exportExcel}>Execute Pipeline</button>
          {saveHint && <span className="chip primary">{saveHint}</span>}
          {lastAddedId && <button className="btn secondary" onClick={undoLast} title="Remove the most recently added step">Undo Last</button>}
        </div>
      </div>
      {toast && (
        <div className={`toast ${toast.type==='warn'?'warn':(toast.type==='error'?'error':'info')}`} role="status" aria-live="polite">
          <span>{toast.text}</span>
          <span className="close" onClick={()=>setToast(null)} aria-label="Close">×</span>
        </div>
      )}
      {page==='upload' && (
        <>
          <div className="panel sidebar">
            <h3 style={{display:'flex',alignItems:'center',gap:8}}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 16V4m0 0l-3.5 3.5M12 4l3.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M20 16.5a4.5 4.5 0 01-4.5 4.5h-7A4.5 4.5 0 014 16.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              Upload
            </h3>
            <UploadZone onUploaded={handleUploaded} notify={notify}/>
            {filesList.length>0 && (
              <div style={{marginTop:8}}>
                <div className="sheet-header">Uploaded files</div>
                <div className="file-list">
                  {filesList.map((f,idx)=>(
                    <label key={idx} className="file-item">
                      <input type="checkbox" checked={!!f.isMain} onChange={()=>{
                        setFilesList(prev=>{
                          const next = prev.map((x,i)=> ({...x, isMain: i===idx}))
                          const main = next.find(x=>x.isMain)
                          const other = next.find(x=>!x.isMain)
                          if (main) { setLastFile(main.file); setFileMeta({ name: main.name, sheets: [] }) }
                          if (other) setJoinAuxFile(other.file)
                          return next
                        })
                      }}/>
                      <span>{f.name}</span>
                      {/\.(xlsx|xls)$/i.test(f.name) && ((f.sheets && f.sheets.length>1)) && <button className="btn secondary" style={{marginLeft:'auto'}} onClick={()=>openSheetsFor(idx)}>Select sheets</button>}
                      {f.isMain && <span className="chip" style={{marginLeft:'auto'}}>Main</span>}
                    </label>
                  ))}
                </div>
              </div>
            )}
            {!!lastFile && (
              <div className="row" style={{marginTop:8}}>
                <div className="chip">Main file set: {fileMeta?.name}</div>
                <button className="btn secondary" onClick={()=>setPage('join')}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{marginRight:6}}><path d="M8 5l8 7-8 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Open Join Assistant
                </button>
              </div>
            )}
          </div>
          <LivePreview columns={previewCols.length?previewCols:columns} rows={previewRows} loading={previewLoading} hasFile={!!lastFile}/>
          <div className="panel tools">
            <h3 style={{display:'flex',alignItems:'center',gap:8}}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 3v2M12 19v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M3 12h2M19 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="2"/></svg>
              Insights & Templates
            </h3>
            <div className="section"><DataInsights showSuggestions={false} file={lastFile} onApplySuggestion={(s)=> {
              if (s && s.applyAll) {
                setSteps(prev => [...prev, ...s.steps.map(st=>({ id:`${Date.now()}-${Math.random()}`, ...st }))])
              } else {
                addStep({ id:`${Date.now()}`, ...(s==='Standardize Date'
                  ? {type:'standardizeDate', config:{col:'Date'}}
                  : s==='Sort by Date'
                  ? {type:'sortByDate', config:{col:'Date', order:'asc'}}
                  : s==='Financial P&L operations'
                  ? {type:'calculateNetProfit', config:{}}
                  : {type:'validateRegex', config:{column:'', pattern:'', mark_col:''}}) })
              }
              setPage('transform')
            }}/></div>
            <div className="section"><TemplatePicker onApply={(tpl)=> { setSteps(tpl.map(x=>({ id:`${Date.now()}-${Math.random()}`, ...x }))); setPage('transform') }}/></div>
          </div>
          {sheetDlg.open && (
            <div className="panel" style={{gridColumn:'1/-1'}}>
              <h3>Select sheets</h3>
              <div className="sheet-list">
                {sheetDlg.sheets.map(s=>(
                  <label key={s} className="sheet-item">
                    <input type="checkbox" checked={sheetDlg.selected.has(s)} onChange={(e)=>{
                      setSheetDlg(prev=>{
                        const sel = new Set(prev.selected)
                        if (e.target.checked) sel.add(s); else sel.delete(s)
                        return { ...prev, selected: sel }
                      })
                    }}/>
                    <span>{s}</span>
                  </label>
                ))}
              </div>
              <div className="row" style={{marginTop:8}}>
                <button className="btn" onClick={applySheetSelection}>Load Selected</button>
                <button className="btn secondary" onClick={()=> setSheetDlg({ open:false, sheets:[], selected:new Set(), index:-1, file:null })}>Cancel</button>
              </div>
            </div>
          )}
        </>
      )}
      {page==='join' && (
        <>
          <div className="panel sidebar">
            <h3>Join</h3>
            {/* File selectors for joining across uploaded files */}
            {filesList.length>1 && (
              <div className="row" style={{marginBottom:8}}>
                <select className="grow" value={filesList.findIndex(f=>f.file===lastFile)} onChange={(e)=>{
                  const idx = parseInt(e.target.value,10)
                  const entry = filesList[idx]
                  if (!entry) return
                  setFilesList(prev=> prev.map((x,i)=> ({...x, isMain: i===idx})))
                  setLastFile(entry.file); setFileMeta({ name: entry.name, sheets: [] })
                }} title="Choose the Main file">
                  {filesList.map((f,i)=><option key={i} value={i}>{`Main: ${f.name}`}</option>)}
                </select>
                <select className="grow" value={Math.max(0, filesList.findIndex(f=>f.file===joinAuxFile))} onChange={(e)=>{
                  const idx = parseInt(e.target.value,10)
                  const entry = filesList[idx]
                  if (!entry) return
                  setJoinAuxFile(entry.file)
                }} title="Choose the Join-with file">
                  {filesList.map((f,i)=><option key={i} value={i}>{`Join: ${f.name}`}</option>)}
                </select>
              </div>
            )}
            <JoinAssistant
              mainFile={lastFile}
              joinFile={joinAuxFile}
              mainSheets={(filesList.find(f=>f.file===lastFile)?.selectedSheets||[])}
              joinSheets={(filesList.find(f=>f.file===joinAuxFile)?.selectedSheets||[])}
              onSetMainSheets={setJoinMainSheets}
              onSetJoinFile={setJoinAuxFile}
              onSetJoinSheets={setJoinOtherSheets}
              onOpenJoinSheets={()=>{
                const idx = filesList.findIndex(f=> f.file===joinAuxFile)
                if (idx>=0) openSheetsFor(idx)
              }}
              onSimulatePreview={(key, how, sample)=> simulateJoinPreview(key, how, sample)}
              onAddJoinStep={(key, how)=> { addStep({ id:`${Date.now()}`, type:'joinWithFile', config:{ key, how } }); setPage('transform') }}
            />
          </div>
          <LivePreview columns={previewCols.length?previewCols:columns} rows={previewRows} loading={previewLoading} hasFile={!!lastFile}/>
          <div className="panel tools">
            <h3>Templates</h3>
            <TemplatePicker onApply={(tpl)=> { setSteps(tpl.map(x=>({ id:`${Date.now()}-${Math.random()}`, ...x }))); setPage('transform') }}/>
          </div>
        </>
      )}
      {page==='transform' && (
        <>
          <RecipeSidebar steps={steps} onAdd={addStep} onRemove={removeStep} onChange={(id, patch)=> setSteps(prev=>prev.map(s=>s.id===id?{...s, config:{...s.config, ...patch}}:s))} columns={columns}/>
          <LivePreview columns={previewCols.length?previewCols:columns} rows={previewRows} loading={previewLoading} hasFile={!!lastFile}/>
          <div className="panel tools">
            <h3>Tools</h3>
            <div className="section"><RecommendationBar recs={recs} steps={steps} onAddStep={s=>addStep({ id: `${Date.now()}`, ...s })}/></div>
            <div className="section"><DataInsights file={lastFile} recipe={steps} mainSheets={(joinMainSheets && joinMainSheets.length)?joinMainSheets:(filesList.find(f=>f.file===lastFile)?.selectedSheets||[])} joinFile={((steps||[]).some(s=>s.type==='joinWithFile'))?joinAuxFile:null} joinSheets={(joinOtherSheets && joinOtherSheets.length)?joinOtherSheets:(filesList.find(f=>f.file===joinAuxFile)?.selectedSheets||[])} onApplySuggestion={(s)=> {
              if (s && s.applyAll) {
                setSteps(prev => [...prev, ...s.steps.map(st=>({ id:`${Date.now()}-${Math.random()}`, ...st }))])
              } else {
                addStep({ id:`${Date.now()}`, ...(s==='Standardize Date'
                  ? {type:'standardizeDate', config:{col:'Date'}}
                  : s==='Sort by Date'
                  ? {type:'sortByDate', config:{col:'Date', order:'asc'}}
                  : s==='Financial P&L operations'
                  ? {type:'calculateNetProfit', config:{}}
                  : {type:'validateRegex', config:{column:'', pattern:'', mark_col:''}}) })
              }
            }}/></div>
            <div className="section"><TemplatePicker onApply={(tpl)=> setSteps(tpl.map(x=>({ id:`${Date.now()}-${Math.random()}`, ...x })) )}/></div>
          </div>
        </>
      )}
    </div>
  )
}
