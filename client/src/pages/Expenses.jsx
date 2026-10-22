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
import ConfirmDialog from '../components/ConfirmDialog';

const STATUS_STYLES = {
  eval:   { label: 'Eval',   classes: 'bg-neutral/15 text-neutral', dot: 'bg-neutral' },
  funded: { label: 'Funded', classes: 'bg-accent-soft text-accent', dot: 'bg-accent' },
  blown:  { label: 'Blown',  classes: 'bg-loss/10 text-loss',       dot: 'bg-loss' },
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

  const money = n => `${n > 0 ? '+' : n < 0 ? '−' : ''}$${fmt(Math.abs(n))}`;
  const moneyClass = n => n > 0 ? 'text-accent' : n < 0 ? 'text-loss' : 'text-slate-500 dark:text-slate-400';
  const fmtDate = str => format(parseISO(str), 'MMM d, yyyy');

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">Expenses</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Prop firm accounts, costs and payouts</p>
        </div>
        <div className="flex gap-2">
          {accounts.length > 0 && (
            <button onClick={handleExport} className="btn-secondary">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V4" />
              </svg>
              Export CSV
            </button>
          )}
          <button onClick={openNew} className="btn-primary">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Account
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card-hero flex flex-col justify-between gap-6">
          <span className="text-xs font-medium text-white/80">Net P&amp;L</span>
          <div>
            <p className="text-4xl font-semibold tabular-nums tracking-tight">{money(netPnl)}</p>
            <p className="text-xs text-white/75 mt-1">payouts − spent</p>
          </div>
        </div>
        <div className="card flex flex-col justify-between gap-6">
          <span className="stat-label">Total spent</span>
          <div>
            <p className="stat-value">${fmt(totalSpent)}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{accounts.length} account{accounts.length !== 1 ? 's' : ''} purchased</p>
          </div>
        </div>
        <div className="card flex flex-col justify-between gap-6">
          <span className="stat-label">Total payouts</span>
          <div>
            <p className={`stat-value ${totalPayouts > 0 ? '!text-accent' : ''}`}>${fmt(totalPayouts)}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {accounts.reduce((s, a) => s + a.payouts.length, 0)} payout{accounts.reduce((s, a) => s + a.payouts.length, 0) !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="card flex flex-col justify-between gap-6">
          <span className="stat-label">Active accounts</span>
          <div>
            <p className="stat-value">{activeCount}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">eval + funded</p>
          </div>
        </div>
      </div>

      {/* Accounts */}
      {accounts.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 gap-3">
          <p className="text-slate-500 dark:text-slate-400 text-sm">No prop firm accounts yet.</p>
          <button onClick={openNew} className="text-sm font-medium text-accent hover:underline">Add your first account →</button>
        </div>
      ) : (
        <div className="card !p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-raised/50">
                <tr className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="pl-6 pr-4 py-3.5 text-left font-medium">Account</th>
                  <th className="px-4 py-3.5 text-left font-medium">Status</th>
                  <th className="px-4 py-3.5 text-left font-medium">Purchased</th>
                  <th className="px-4 py-3.5 text-left font-medium">Passed / Blown</th>
                  <th className="px-4 py-3.5 text-right font-medium">Price</th>
                  <th className="px-4 py-3.5 text-right font-medium">Payouts</th>
                  <th className="px-4 py-3.5 text-right font-medium">Net P&amp;L</th>
                  <th className="pl-4 pr-6 py-3.5"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {accounts.map(account => {
                  const net        = account.total_payouts - account.purchase_price;
                  const s          = STATUS_STYLES[account.status];
                  const isExpanded = expandedPayouts.has(account.id);
                  const pf         = payoutForms[account.id] || EMPTY_PAYOUT;

                  return [
                    <tr key={account.id} className={`group transition-colors hover:bg-surface-raised/60 ${isExpanded ? 'bg-surface-raised/40' : ''}`}>
                      <td className="pl-6 pr-4 py-4 max-w-[280px]">
                        <p className="font-semibold text-slate-900 dark:text-white leading-tight">{account.firm_name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate" title={account.notes || undefined}>
                          ${fmt(account.account_size)} account{account.notes ? ` · ${account.notes}` : ''}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${s.classes}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                          {s.label}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-slate-700 dark:text-slate-300 tabular-nums">{fmtDate(account.purchased_at)}</td>
                      <td className="px-4 py-4 whitespace-nowrap tabular-nums">
                        {account.passed_at || account.blown_at ? (
                          <div className="space-y-0.5 text-xs">
                            {account.passed_at && (
                              <p><span className="text-slate-500 dark:text-slate-400">Passed </span><span className="text-accent font-medium">{fmtDate(account.passed_at)}</span></p>
                            )}
                            {account.blown_at && (
                              <p><span className="text-slate-500 dark:text-slate-400">Blown </span><span className="text-loss font-medium">{fmtDate(account.blown_at)}</span></p>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right tabular-nums text-slate-700 dark:text-slate-300">${fmt(account.purchase_price)}</td>
                      <td className="px-4 py-4 text-right">
                        <button
                          onClick={() => togglePayouts(account.id)}
                          className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 -mr-2 tabular-nums transition-colors hover:bg-surface-raised
                            ${account.total_payouts > 0 ? 'text-accent font-medium' : 'text-slate-500 dark:text-slate-400'}`}
                          title={isExpanded ? 'Hide payouts' : 'Show payouts'}
                        >
                          ${fmt(account.total_payouts)}
                          <span className="text-xs text-slate-400 dark:text-slate-500 font-normal">({account.payouts.length})</span>
                          <svg
                            className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </td>
                      <td className={`px-4 py-4 text-right font-semibold tabular-nums ${moneyClass(net)}`}>{money(net)}</td>
                      <td className="pl-4 pr-6 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(account)} className="btn-ghost !px-3 !py-1.5 text-xs">Edit</button>
                          <button onClick={() => handleDelete(account.id)} className="btn-ghost !px-3 !py-1.5 text-xs hover:!text-loss hover:!bg-loss/10">Delete</button>
                        </div>
                      </td>
                    </tr>,

                    isExpanded && (
                      <tr key={`${account.id}-payouts`} className="bg-surface-raised/40">
                        <td colSpan={8} className="px-6 pb-5 pt-1">
                          <div className="grid gap-4 items-start lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
                            {/* Payout list */}
                            <div className="rounded-2xl bg-surface-card p-4">
                              <p className="card-title mb-3">Payouts</p>
                              {account.payouts.length > 0 ? (
                                <ul className="divide-y divide-surface-border">
                                  {account.payouts.map(p => (
                                    <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                                      <div className="min-w-0">
                                        <p className="text-accent text-sm font-semibold tabular-nums">+${fmt(p.amount)}</p>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                          {fmtDate(p.payout_date)}
                                          {p.notes && <span> · {p.notes}</span>}
                                        </p>
                                      </div>
                                      <button
                                        onClick={() => handleDeletePayout(account.id, p.id, p.amount)}
                                        className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-loss hover:bg-loss/10 transition-colors"
                                        title="Delete payout"
                                      >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="text-sm text-slate-500 dark:text-slate-400 py-2">No payouts yet.</p>
                              )}
                            </div>

                            {/* Add payout form */}
                            <div className="rounded-2xl bg-surface-card p-4 space-y-3">
                              <p className="card-title">Add payout</p>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="label">Amount ($)</label>
                                  <input
                                    type="number"
                                    placeholder="0"
                                    className="input"
                                    value={pf.amount}
                                    onChange={e => setPayoutField(account.id, 'amount', e.target.value)}
                                  />
                                </div>
                                <div>
                                  <label className="label">Date</label>
                                  <input
                                    type="date"
                                    className="input"
                                    value={pf.payout_date}
                                    onChange={e => setPayoutField(account.id, 'payout_date', e.target.value)}
                                  />
                                </div>
                              </div>
                              <input
                                type="text"
                                placeholder="Notes (optional)"
                                className="input"
                                value={pf.notes}
                                onChange={e => setPayoutField(account.id, 'notes', e.target.value)}
                              />
                              <button
                                onClick={() => handleAddPayout(account.id)}
                                disabled={addingPayout.has(account.id) || !pf.amount}
                                className="btn-primary w-full"
                              >
                                {addingPayout.has(account.id) ? 'Adding...' : 'Add Payout'}
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Confirm dialog */}
      {confirm && (
        <ConfirmDialog
          message={confirm.message}
          subtext={confirm.subtext}
          confirmLabel="Delete"
          onConfirm={() => { confirm.onConfirm(); setConfirm(null); }}
          onCancel={() => setConfirm(null)}
        />
      )}

      {/* New / Edit modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 !m-0 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative card w-full max-w-md space-y-5 shadow-2xl">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                {editingId ? 'Edit Account' : 'New Prop Firm Account'}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                {editingId ? 'Update the account details.' : 'Track the cost and outcome of a prop firm account.'}
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="label">Firm name</label>
                <input
                  className="input"
                  placeholder="e.g. FTMO"
                  value={form.firm_name}
                  onChange={e => setForm(f => ({ ...f, firm_name: e.target.value }))}
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Account size ($)</label>
                  <input
                    type="number"
                    className="input"
                    placeholder="50000"
                    value={form.account_size}
                    onChange={e => setForm(f => ({ ...f, account_size: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label">Purchase price ($)</label>
                  <input
                    type="number"
                    className="input"
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
                    className="input"
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
                  <label className="label">Purchase date</label>
                  <input
                    type="date"
                    className="input"
                    value={form.purchased_at}
                    onChange={e => setForm(f => ({ ...f, purchased_at: e.target.value }))}
                  />
                </div>
              </div>

              {(form.status === 'funded' || form.status === 'blown') && (
                <div className={`grid gap-3 ${form.status === 'blown' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  <div>
                    <label className="label">Passed date <span className="text-slate-400 dark:text-slate-500 font-normal">(optional)</span></label>
                    <input
                      type="date"
                      className="input"
                      value={form.passed_at}
                      onChange={e => setForm(f => ({ ...f, passed_at: e.target.value }))}
                    />
                  </div>
                  {form.status === 'blown' && (
                    <div>
                      <label className="label">Blown date <span className="text-slate-400 dark:text-slate-500 font-normal">(optional)</span></label>
                      <input
                        type="date"
                        className="input"
                        value={form.blown_at}
                        onChange={e => setForm(f => ({ ...f, blown_at: e.target.value }))}
                      />
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="label">Notes <span className="text-slate-400 dark:text-slate-500 font-normal">(optional)</span></label>
                <textarea
                  className="input resize-none"
                  rows={2}
                  placeholder="Any notes..."
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-1">
              <button onClick={() => setShowModal(false)} className="btn-ghost">Cancel</button>
              <button
                onClick={handleSave}
                disabled={saving || !form.firm_name || !form.account_size || !form.purchase_price}
                className="btn-primary"
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
