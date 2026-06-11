import { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import {
  getExpenseAccounts,
  createExpenseAccount,
  updateExpenseAccount,
  deleteExpenseAccount,
  createPayout,
  deletePayout,
} from '../api';
import StatCard from '../components/StatCard';

const STATUS_STYLES = {
  eval:   { label: 'Eval',   classes: 'bg-yellow-500/15 text-yellow-400' },
  funded: { label: 'Funded', classes: 'bg-lime-500/15 text-[#c6f135]' },
  blown:  { label: 'Blown',  classes: 'bg-orange-500/15 text-orange-400' },
};

const EMPTY_FORM = {
  firm_name: '',
  account_size: '',
  purchase_price: '',
  status: 'eval',
  purchased_at: new Date().toISOString().slice(0, 10),
  passed_at: '',
  blown_at: '',
  notes: '',
};

const EMPTY_PAYOUT = {
  amount: '',
  payout_date: new Date().toISOString().slice(0, 10),
  notes: '',
};

function fmt(n) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export default function Expenses() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [expandedPayouts, setExpandedPayouts] = useState(new Set());
  const [payoutForms, setPayoutForms] = useState({});
  const [addingPayout, setAddingPayout] = useState(new Set());
  const [confirm, setConfirm] = useState(null); // { message, subtext?, onConfirm }

  function askConfirm(message, subtext, onConfirm) {
    setConfirm({ message, subtext, onConfirm });
  }

  useEffect(() => {
    getExpenseAccounts()
      .then(setAccounts)
      .finally(() => setLoading(false));
  }, []);

  const totalSpent    = accounts.reduce((s, a) => s + a.purchase_price, 0);
  const totalPayouts  = accounts.reduce((s, a) => s + a.total_payouts, 0);
  const netPnl        = totalPayouts - totalSpent;
  const activeCount   = accounts.filter(a => a.status !== 'blown').length;

  function handleExport() {
    const headers = ['Firm Name', 'Account Size', 'Purchase Price', 'Status', 'Purchased At', 'Total Payouts', 'Net P&L', 'Notes'];
    const rows = accounts.map(a => [
      a.firm_name,
      a.account_size,
      a.purchase_price,
      a.status,
      a.purchased_at.slice(0, 10),
      a.total_payouts,
      a.total_payouts - a.purchase_price,
      a.notes || '',
    ]);
    const csv = [headers, ...rows]
      .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `expenses_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function openNew() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  }

  function openEdit(account) {
    setEditingId(account.id);
    setForm({
      firm_name:      account.firm_name,
      account_size:   String(account.account_size),
      purchase_price: String(account.purchase_price),
      status:         account.status,
      purchased_at:   account.purchased_at.slice(0, 10),
      passed_at:      account.passed_at ? account.passed_at.slice(0, 10) : '',
      blown_at:       account.blown_at  ? account.blown_at.slice(0, 10)  : '',
      notes:          account.notes || '',
    });
    setShowModal(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const data = {
        ...form,
        account_size:   parseFloat(form.account_size),
        purchase_price: parseFloat(form.purchase_price),
      };
      if (editingId) {
        const updated = await updateExpenseAccount(editingId, data);
        setAccounts(prev => prev.map(a => a.id === editingId ? updated : a));
      } else {
        const created = await createExpenseAccount(data);
        setAccounts(prev => [created, ...prev]);
      }
      setShowModal(false);
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(id) {
    askConfirm(
      'Delete this account?',
      'All payouts linked to this account will be deleted too.',
      async () => {
        await deleteExpenseAccount(id);
        setAccounts(prev => prev.filter(a => a.id !== id));
      }
    );
  }

  function togglePayouts(id) {
    setExpandedPayouts(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function setPayoutField(accountId, field, value) {
    setPayoutForms(prev => ({
      ...prev,
      [accountId]: { ...(prev[accountId] || EMPTY_PAYOUT), [field]: value },
    }));
  }

  async function handleAddPayout(accountId) {
    const pf = payoutForms[accountId] || EMPTY_PAYOUT;
    if (!pf.amount || !pf.payout_date) return;

    setAddingPayout(prev => new Set(prev).add(accountId));
    try {
      const payout = await createPayout(accountId, { ...pf, amount: parseFloat(pf.amount) });
      setAccounts(prev => prev.map(a => {
        if (a.id !== accountId) return a;
        return { ...a, total_payouts: a.total_payouts + payout.amount, payouts: [payout, ...a.payouts] };
      }));
      setPayoutForms(prev => ({ ...prev, [accountId]: EMPTY_PAYOUT }));
    } finally {
      setAddingPayout(prev => { const n = new Set(prev); n.delete(accountId); return n; });
    }
  }

  function handleDeletePayout(accountId, payoutId, amount) {
    askConfirm(
      'Delete this payout?',
      null,
      async () => {
        await deletePayout(payoutId);
        setAccounts(prev => prev.map(a => {
          if (a.id !== accountId) return a;
          return { ...a, total_payouts: a.total_payouts - amount, payouts: a.payouts.filter(p => p.id !== payoutId) };
        }));
      }
    );
  }

  if (loading) {
    return <div className="p-8 text-slate-500 text-sm">Loading...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Expenses</h1>
        <div className="flex gap-2">
          {accounts.length > 0 && (
            <button onClick={handleExport} className="btn-ghost text-sm">Export CSV</button>
          )}
          <button onClick={openNew} className="btn-primary text-sm">+ New Account</button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Spent"      value={`$${fmt(totalSpent)}`} />
        <StatCard label="Total Payouts"    value={`$${fmt(totalPayouts)}`} />
        <StatCard
          label="Net P&L"
          value={`${netPnl >= 0 ? '+' : ''}$${fmt(netPnl)}`}
          valueClass={netPnl > 0 ? 'text-profit' : netPnl < 0 ? 'text-loss' : 'text-white'}
        />
        <StatCard label="Active Accounts"  value={String(activeCount)} />
      </div>

      {/* Empty state */}
      {accounts.length === 0 ? (
        <div className="card text-slate-500 text-sm text-center py-12">
          No prop firm accounts yet. Click "+ New Account" to add one.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map(account => {
            const net       = account.total_payouts - account.purchase_price;
            const s         = STATUS_STYLES[account.status];
            const isExpanded = expandedPayouts.has(account.id);
            const pf        = payoutForms[account.id] || EMPTY_PAYOUT;

            return (
              <div key={account.id} className="card flex flex-col gap-4">
                {/* Tile header */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-white text-base leading-tight">{account.firm_name}</p>
                    <p className="text-sm text-slate-400">${fmt(account.account_size)} account</p>
                  </div>
                  <span className={`shrink-0 text-xs font-medium px-2.5 py-0.5 rounded-full ${s.classes}`}>
                    {s.label}
                  </span>
                </div>

                {/* Financial stats */}
                <div className="grid grid-cols-3 gap-x-4 gap-y-3 text-sm">
                  <div>
                    <p className="text-slate-500 text-xs mb-0.5">Purchase Price</p>
                    <p className="text-white font-medium">${fmt(account.purchase_price)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs mb-0.5">Total Payouts</p>
                    <p className="font-medium text-[#c6f135]">${fmt(account.total_payouts)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs mb-0.5">Net P&L</p>
                    <p className={`font-medium ${net > 0 ? 'text-profit' : net < 0 ? 'text-loss' : 'text-white'}`}>
                      {net >= 0 ? '+' : ''}${fmt(net)}
                    </p>
                  </div>
                </div>

                {/* Dates */}
                <div className="space-y-1.5 border-t border-surface-border pt-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Purchased</span>
                    <span className="text-white">{format(parseISO(account.purchased_at), 'MMM d, yyyy')}</span>
                  </div>
                  {account.passed_at && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">Passed</span>
                      <span className="text-[#c6f135]">{format(parseISO(account.passed_at), 'MMM d, yyyy')}</span>
                    </div>
                  )}
                  {account.blown_at && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">Blown</span>
                      <span className="text-orange-400">{format(parseISO(account.blown_at), 'MMM d, yyyy')}</span>
                    </div>
                  )}
                </div>

                {/* Payouts toggle */}
                <button
                  onClick={() => togglePayouts(account.id)}
                  className="flex items-center justify-between w-full text-xs text-slate-400 hover:text-white transition-colors pt-2 border-t border-surface-border"
                >
                  <span>Payouts ({account.payouts.length})</span>
                  <svg
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Payouts expanded section */}
                {isExpanded && (
                  <div className="space-y-3 -mt-1">
                    {account.payouts.length > 0 ? (
                      <div className="space-y-1.5">
                        {account.payouts.map(p => (
                          <div key={p.id} className="flex items-center justify-between bg-surface-raised rounded-lg px-3 py-2">
                            <div>
                              <p className="text-[#c6f135] text-sm font-medium">+${fmt(p.amount)}</p>
                              <p className="text-slate-500 text-xs">
                                {format(parseISO(p.payout_date), 'MMM d, yyyy')}
                                {p.notes && <span className="text-slate-600"> · {p.notes}</span>}
                              </p>
                            </div>
                            <button
                              onClick={() => handleDeletePayout(account.id, p.id, p.amount)}
                              className="text-slate-600 hover:text-orange-400 transition-colors ml-3"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-slate-600 text-xs text-center py-1">No payouts yet</p>
                    )}

                    {/* Add payout form */}
                    <div className="space-y-2 pt-1 border-t border-surface-border">
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          placeholder="Amount ($)"
                          className="input text-sm"
                          value={pf.amount}
                          onChange={e => setPayoutField(account.id, 'amount', e.target.value)}
                        />
                        <input
                          type="date"
                          className="input text-sm"
                          value={pf.payout_date}
                          onChange={e => setPayoutField(account.id, 'payout_date', e.target.value)}
                        />
                      </div>
                      <input
                        type="text"
                        placeholder="Notes (optional)"
                        className="input text-sm w-full"
                        value={pf.notes}
                        onChange={e => setPayoutField(account.id, 'notes', e.target.value)}
                      />
                      <button
                        onClick={() => handleAddPayout(account.id)}
                        disabled={addingPayout.has(account.id) || !pf.amount}
                        className="btn-primary w-full text-sm py-1.5 disabled:opacity-40"
                      >
                        {addingPayout.has(account.id) ? 'Adding...' : '+ Add Payout'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Footer actions */}
                <div className="flex gap-2 pt-1 border-t border-surface-border">
                  <button onClick={() => openEdit(account)} className="btn-ghost text-xs flex-1">Edit</button>
                  <button onClick={() => handleDelete(account.id)} className="btn-ghost text-xs flex-1 text-orange-400/70 hover:bg-orange-500/10 hover:text-orange-400">Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirm dialog */}
      {confirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-xs space-y-4">
            <div className="space-y-1">
              <p className="text-white font-semibold text-sm">{confirm.message}</p>
              {confirm.subtext && <p className="text-slate-500 text-xs">{confirm.subtext}</p>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setConfirm(null)} className="btn-ghost flex-1 text-sm">Cancel</button>
              <button
                onClick={() => { confirm.onConfirm(); setConfirm(null); }}
                className="flex-1 text-sm px-3 py-1.5 rounded-xl bg-orange-500/15 text-orange-400 hover:bg-orange-500/25 transition-colors font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New / Edit modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="card w-full max-w-md space-y-4">
            <h2 className="text-base font-semibold text-white">
              {editingId ? 'Edit Account' : 'New Prop Firm Account'}
            </h2>

            <div className="space-y-3">
              <div>
                <label className="label">Firm Name</label>
                <input
                  className="input w-full"
                  placeholder="e.g. FTMO"
                  value={form.firm_name}
                  onChange={e => setForm(f => ({ ...f, firm_name: e.target.value }))}
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Account Size ($)</label>
                  <input
                    type="number"
                    className="input w-full"
                    placeholder="50000"
                    value={form.account_size}
                    onChange={e => setForm(f => ({ ...f, account_size: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label">Purchase Price ($)</label>
                  <input
                    type="number"
                    className="input w-full"
                    placeholder="499"
                    value={form.purchase_price}
                    onChange={e => setForm(f => ({ ...f, purchase_price: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Status</label>
                  <select
                    className="input w-full"
                    value={form.status}
                    onChange={e => {
                      const status = e.target.value;
                      const today = new Date().toISOString().slice(0, 10);
                      setForm(f => ({
                        ...f,
                        status,
                        passed_at: status === 'funded' || status === 'blown' ? (f.passed_at || today) : f.passed_at,
                        blown_at:  status === 'blown' ? (f.blown_at || today) : f.blown_at,
                      }));
                    }}
                  >
                    <option value="eval">Eval</option>
                    <option value="funded">Funded</option>
                    <option value="blown">Blown</option>
                  </select>
                </div>
                <div>
                  <label className="label">Purchase Date</label>
                  <input
                    type="date"
                    className="input w-full"
                    value={form.purchased_at}
                    onChange={e => setForm(f => ({ ...f, purchased_at: e.target.value }))}
                  />
                </div>
              </div>

              {(form.status === 'funded' || form.status === 'blown') && (
                <div className={`grid gap-3 ${form.status === 'blown' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  <div>
                    <label className="label">Passed Date <span className="text-slate-600 font-normal">(optional)</span></label>
                    <input
                      type="date"
                      className="input w-full"
                      value={form.passed_at}
                      onChange={e => setForm(f => ({ ...f, passed_at: e.target.value }))}
                    />
                  </div>
                  {form.status === 'blown' && (
                    <div>
                      <label className="label">Blown Date <span className="text-slate-600 font-normal">(optional)</span></label>
                      <input
                        type="date"
                        className="input w-full"
                        value={form.blown_at}
                        onChange={e => setForm(f => ({ ...f, blown_at: e.target.value }))}
                      />
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="label">Notes <span className="text-slate-600 font-normal">(optional)</span></label>
                <textarea
                  className="input w-full resize-none"
                  rows={2}
                  placeholder="Any notes..."
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowModal(false)} className="btn-ghost flex-1">Cancel</button>
              <button
                onClick={handleSave}
                disabled={saving || !form.firm_name || !form.account_size || !form.purchase_price}
                className="btn-primary flex-1 disabled:opacity-40"
              >
                {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
